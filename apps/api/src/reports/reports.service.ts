import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  type Db,
  integrations,
  reportRecipients,
  reportRuns,
  reports,
  workspaces,
} from '@lidomer/db';
import {
  dueSlot,
  INTEGRATION_LABELS,
  type IntegrationType,
  type ReportDto,
  type ReportInput,
  reportConfigSchema,
  reportPeriodRange,
  type ReportRunDto,
  reportScheduleSchema,
  type Recipient,
  type ReportPreviewRequest,
  type ReportTargetsResponse,
  type ReportPreviewResponse,
  type ReportSnapshot,
  reportPageCount,
  shiftDay,
  slotUtc,
  toDayKey,
} from '@lidomer/shared';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { HttpError } from '../common/http';
import { mapLimit } from '../common/map-limit';
import { PREVIEWS_BUCKET, Storage } from '../common/storage';
import { ENV, type Env } from '../config/env';
import { DB } from '../db/db.module';
import { InsightsRepository } from '../reconciliation/insights.repository';
import { MetricsRepository } from '../reconciliation/metrics.repository';
import { MembershipRepository } from '../workspaces/membership.repository';
import { buildCaption } from './caption';
import { signRun } from './signing';
import { TelegramService } from './telegram.service';
import { WhatsappService } from './whatsapp.service';
import { pngToPdf } from './pdf';

const REPORTS_BUCKET = 'reports';
/** Сколько ждать свежих данных после слота. */
const WAIT_MS = 15 * 60_000;
/** Источник свежий, если синхронизировался не раньше «слот − интервал». */
const CADENCE_MS: Partial<Record<IntegrationType, number>> = {
  ward: 20 * 60_000,
  bitrix24: 70 * 60_000,
  meta_ads: 190 * 60_000,
};

type ProcessResult = 'done' | 'wait';

const hhmm = (d: Date, tz: string) =>
  new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(d);

@Injectable()
export class ReportsService {
  private readonly log = new Logger(ReportsService.name);
  private readonly storage: Storage;

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
    @Inject(MetricsRepository) private readonly metrics: MetricsRepository,
    @Inject(InsightsRepository) private readonly insights: InsightsRepository,
    @Inject(TelegramService) private readonly telegram: TelegramService,
    @Inject(MembershipRepository) private readonly membership: MembershipRepository,
    @Inject(WhatsappService) private readonly whatsapp: WhatsappService,
  ) {
    this.storage = new Storage(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  }

  // ---------- CRUD ----------

  async list(workspaceId: string): Promise<ReportDto[]> {
    const [rows, ws] = await Promise.all([
      this.db
        .select()
        .from(reports)
        .where(eq(reports.workspaceId, workspaceId))
        .orderBy(reports.createdAt),
      this.db
        .select({ tz: workspaces.timezone })
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId)),
    ]);
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const [recips, runs] = await Promise.all([
      this.db.select().from(reportRecipients).where(inArray(reportRecipients.reportId, ids)),
      this.db
        .select()
        .from(reportRuns)
        .where(inArray(reportRuns.reportId, ids))
        .orderBy(desc(reportRuns.createdAt)),
    ]);
    const tz = ws[0]?.tz ?? 'Asia/Bishkek';
    return rows.map((r) => {
      const last = runs.find((x) => x.reportId === r.id);
      const schedule = reportScheduleSchema.parse(r.schedule);
      return {
        id: r.id,
        name: r.name,
        template: r.template as ReportDto['template'],
        config: reportConfigSchema.parse(r.config),
        schedule,
        enabled: r.enabled,
        recipients: recips
          .filter((x) => x.reportId === r.id)
          .map((x) => ({ channel: x.channel, chatId: x.chatId, threadId: x.threadId })),
        lastRun: last
          ? {
              id: last.id,
              status: last.status,
              scheduledFor: last.scheduledFor.toISOString(),
              sentAt: last.sentAt?.toISOString() ?? null,
            }
          : null,
        nextRunAt: r.enabled ? (nextSlot(schedule, tz, new Date())?.toISOString() ?? null) : null,
      };
    });
  }

  async save(
    workspaceId: string,
    actorId: string,
    input: ReportInput,
    id?: string,
  ): Promise<string> {
    // Дубли убираем; каждый получатель — по своему каналу.
    const key = (r: Recipient) => `${r.channel}|${r.chatId}|${r.threadId ?? ''}`;
    const recipients = [...new Map(input.recipients.map((r) => [key(r), r])).values()];
    for (const r of recipients) await this.assertRecipient(workspaceId, r);
    return this.db.transaction(async (tx) => {
      let reportId = id;
      const values = {
        name: input.name,
        template: input.template,
        config: input.config,
        schedule: input.schedule,
        enabled: input.enabled,
        // Кто последним сохранил — тот и запланировал: «Маркетолог» внизу отчёта.
        updatedBy: actorId,
      };
      if (reportId) {
        const upd = await tx
          .update(reports)
          .set(values)
          .where(and(eq(reports.id, reportId), eq(reports.workspaceId, workspaceId)))
          .returning({ id: reports.id });
        if (!upd.length) throw new NotFoundException('Отчёт не найден');
        await tx.delete(reportRecipients).where(eq(reportRecipients.reportId, reportId));
      } else {
        const [row] = await tx
          .insert(reports)
          .values({ ...values, workspaceId, createdBy: actorId })
          .returning({ id: reports.id });
        reportId = row!.id;
      }
      if (recipients.length) {
        await tx.insert(reportRecipients).values(
          recipients.map((r) => ({
            workspaceId,
            reportId: reportId!,
            channel: r.channel,
            chatId: r.chatId,
            threadId: r.threadId,
          })),
        );
      }
      return reportId!;
    });
  }

  /** Чат принадлежит компании по своему каналу; иначе 400. */
  async assertRecipient(workspaceId: string, r: Recipient): Promise<void> {
    const ok =
      r.channel === 'telegram'
        ? this.telegram.configured && (await this.telegram.chatBelongs(workspaceId, r.chatId))
        : await this.whatsapp.chatBelongs(workspaceId, r.chatId);
    if (!ok) throw new BadRequestException('Получатель не подключён к компании');
  }

  /** Куда можно отправить: группы и темы Telegram и группы WhatsApp одним списком. */
  async targets(workspaceId: string): Promise<ReportTargetsResponse> {
    const [chats, wa] = await Promise.all([
      this.telegram.configured ? this.telegram.listChats(workspaceId) : Promise.resolve([]),
      this.whatsapp.status(workspaceId),
    ]);
    return {
      telegram: { configured: this.telegram.configured },
      whatsapp: { status: wa.status },
      targets: [
        ...chats.flatMap((c) => [
          {
            channel: 'telegram' as const,
            chatId: c.id,
            threadId: null,
            chatTitle: c.title,
            topicTitle: null,
            active: c.active,
          },
          ...c.topics.map((t) => ({
            channel: 'telegram' as const,
            chatId: c.id,
            threadId: t.id,
            chatTitle: c.title,
            topicTitle: t.name,
            active: c.active,
          })),
        ]),
        ...wa.groups.map((g) => ({
          channel: 'green_api' as const,
          chatId: g.id,
          threadId: null,
          chatTitle: g.name,
          topicTitle: null,
          active: wa.status === 'connected',
        })),
      ],
    };
  }

  async remove(workspaceId: string, id: string): Promise<void> {
    await this.db
      .delete(reports)
      .where(and(eq(reports.id, id), eq(reports.workspaceId, workspaceId)));
  }

  async runs(workspaceId: string, reportId?: string): Promise<ReportRunDto[]> {
    const rows = await this.db
      .select()
      .from(reportRuns)
      .where(
        and(
          eq(reportRuns.workspaceId, workspaceId),
          reportId ? eq(reportRuns.reportId, reportId) : undefined,
        ),
      )
      .orderBy(desc(reportRuns.createdAt))
      .limit(30);
    const files = await this.storage
      .signedUrls(
        REPORTS_BUCKET,
        rows.flatMap((r) => [r.imagePath, r.pdfPath].filter((x): x is string => !!x)),
      )
      .catch(() => new Map<string, string>());
    return rows.map((r) => ({
      id: r.id,
      reportId: r.reportId,
      scheduledFor: r.scheduledFor.toISOString(),
      isTest: r.isTest,
      status: r.status,
      caption: r.caption,
      dataNote: r.dataNote,
      imageUrl: (r.imagePath && files.get(r.imagePath)) ?? null,
      pdfUrl: (r.pdfPath && files.get(r.pdfPath)) ?? null,
      deliveries: r.deliveries as ReportRunDto['deliveries'],
      error: r.error,
      sentAt: r.sentAt?.toISOString() ?? null,
    }));
  }

  // ---------- Расписание ----------

  /** Слоты, которым пришло время: создаём запуск (один на слот) и возвращаем id для очереди. */
  async schedule(now: Date): Promise<{ workspaceId: string; runId: string }[]> {
    const rows = await this.db
      .select({ r: reports, tz: workspaces.timezone })
      .from(reports)
      .innerJoin(workspaces, eq(workspaces.id, reports.workspaceId))
      .where(eq(reports.enabled, true));
    const out: { workspaceId: string; runId: string }[] = [];
    for (const { r, tz } of rows) {
      const slot = dueSlot(reportScheduleSchema.parse(r.schedule), tz, now);
      if (!slot) continue;
      const [run] = await this.db
        .insert(reportRuns)
        .values({ workspaceId: r.workspaceId, reportId: r.id, scheduledFor: slot })
        .onConflictDoNothing()
        .returning({ id: reportRuns.id });
      if (run) out.push({ workspaceId: r.workspaceId, runId: run.id });
    }
    return out;
  }

  async createTestRun(workspaceId: string, reportId: string): Promise<string> {
    const [rep] = await this.db
      .select({ id: reports.id })
      .from(reports)
      .where(and(eq(reports.id, reportId), eq(reports.workspaceId, workspaceId)));
    if (!rep) throw new NotFoundException('Отчёт не найден');
    const [run] = await this.db
      .insert(reportRuns)
      .values({ workspaceId, reportId, scheduledFor: new Date(), isTest: true })
      .returning({ id: reportRuns.id });
    return run!.id;
  }

  /**
   * Предпросмотр в конструкторе: снимок цифр «как если бы отчёт ушёл сейчас» и подпись.
   * Ничего не сохраняет и никуда не отправляет.
   */
  async preview(
    workspaceId: string,
    actorId: string,
    input: ReportPreviewRequest,
  ): Promise<ReportPreviewResponse> {
    const [ws] = await this.db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
    if (!ws) throw new NotFoundException('Компания не найдена');
    const sources = await this.db
      .select()
      .from(integrations)
      .where(eq(integrations.workspaceId, ws.id));
    const active = sources.filter(
      (s) => s.status !== 'disabled' && s.status !== 'not_connected' && CADENCE_MS[s.type],
    );
    // Предпросмотр — от имени текущего пользователя: сохранив, он и станет тем, кто запланировал.
    const snapshot = await this.snapshot(ws, input, new Date(), active, null, actorId);
    return { snapshot, caption: buildCaption(snapshot) };
  }

  // ---------- Запуск ----------

  /**
   * Собрать снимок, нарисовать картинку, отправить. 'wait' — данные ещё не обновились,
   * повторить позже (не дольше 15 минут после слота). Тестовая отправка не ждёт.
   */
  async processRun(runId: string, testTarget?: Recipient): Promise<ProcessResult> {
    const [row] = await this.db
      .select({ run: reportRuns, report: reports, ws: workspaces })
      .from(reportRuns)
      .innerJoin(reports, eq(reports.id, reportRuns.reportId))
      .innerJoin(workspaces, eq(workspaces.id, reportRuns.workspaceId))
      .where(eq(reportRuns.id, runId));
    if (!row) return 'done';
    const { run, report, ws } = row;
    if (run.status === 'sent') return 'done';
    const now = new Date();

    // Свежесть источников.
    const sources = await this.db
      .select()
      .from(integrations)
      .where(eq(integrations.workspaceId, ws.id));
    const active = sources.filter(
      (s) => s.status !== 'disabled' && s.status !== 'not_connected' && CADENCE_MS[s.type],
    );
    const stale = active.filter(
      (s) =>
        !s.lastSyncAt || s.lastSyncAt.getTime() < run.scheduledFor.getTime() - CADENCE_MS[s.type]!,
    );
    if (stale.length && !run.isTest && now.getTime() < run.scheduledFor.getTime() + WAIT_MS) {
      await this.db
        .update(reportRuns)
        .set({ status: 'waiting_data' })
        .where(eq(reportRuns.id, run.id));
      return 'wait';
    }
    const dataNote = stale.length
      ? stale
          .map(
            (s) =>
              `данные ${INTEGRATION_LABELS[s.type]} ${s.lastSyncAt ? `на ${hhmm(s.lastSyncAt, ws.timezone)}` : 'не получены'}`,
          )
          .join(', ')
      : null;

    const snapshot = await this.snapshot(
      ws,
      report,
      run.scheduledFor,
      active,
      dataNote,
      report.updatedBy ?? report.createdBy,
    );
    const caption = buildCaption(snapshot);
    await this.db
      .update(reportRuns)
      .set({ snapshot, caption, dataNote })
      .where(eq(reportRuns.id, run.id));

    // Страницы рисует web по снимку: 1 — главные цифры (это и PNG), дальше — креативы (только PDF).
    // Одна подпись ссылки на все страницы.
    const { exp, sig } = signRun(this.env.CRON_SECRET, run.id);
    const webOrigin = this.env.WEB_ORIGIN.split(',')[0]!.trim().replace(/\/$/, '');
    const page = async (n: number) => {
      const res = await fetch(
        `${webOrigin}/api/og/report/${run.id}?page=${n}&exp=${exp}&sig=${sig}`,
      );
      if (!res.ok)
        throw new HttpError(res.status, `Страница ${n} отчёта не нарисовалась (${res.status})`);
      return res.arrayBuffer();
    };
    const png = await page(1);
    const imagePath = `${ws.id}/${run.id}.png`;
    await this.storage.upload(REPORTS_BUCKET, imagePath, png, 'image/png');

    const { format } = reportConfigSchema.parse(report.config);
    let pdf: Uint8Array | null = null;
    let pdfPath: string | null = null;
    if (format === 'pdf') {
      const more = Array.from(
        { length: reportPageCount(snapshot.creatives.length) - 1 },
        (_, i) => i + 2,
      );
      const pages = [png, ...(await mapLimit(more, 3, page))];
      pdf = await pngToPdf(pages, `${report.name} · ${snapshot.period.from}`);
      pdfPath = `${ws.id}/${run.id}.pdf`;
      await this.storage.upload(
        REPORTS_BUCKET,
        pdfPath,
        new Uint8Array(pdf).buffer,
        'application/pdf',
      );
    }

    const recipients: Recipient[] = testTarget
      ? [testTarget]
      : await this.db
          .select({
            channel: reportRecipients.channel,
            chatId: reportRecipients.chatId,
            threadId: reportRecipients.threadId,
          })
          .from(reportRecipients)
          .where(eq(reportRecipients.reportId, report.id));
    const pdfName = `${report.name} ${snapshot.period.from === snapshot.period.to ? snapshot.period.from : `${snapshot.period.from}_${snapshot.period.to}`}.pdf`;
    const deliveries = [];
    for (const r of recipients) {
      // Каждому получателю — своим каналом; ошибка одного не мешает остальным.
      try {
        if (r.channel === 'green_api') {
          // PNG с именем report.png придёт фото, PDF — документом.
          await this.whatsapp.sendReport(
            ws.id,
            r.chatId,
            pdf ?? png,
            pdf ? pdfName : 'report.png',
            caption,
          );
        } else {
          const tg = this.telegram.client();
          if (pdf) await tg.sendDocument(r.chatId, pdf, pdfName, caption, r.threadId);
          else await tg.sendPhoto(r.chatId, png, caption, r.threadId);
        }
        deliveries.push({ ...r, ok: true, error: null });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (r.channel === 'telegram' && err instanceof HttpError && err.status === 403)
          await this.telegram.markInactive(r.chatId);
        deliveries.push({ ...r, ok: false, error: msg });
      }
    }
    const okCount = deliveries.filter((d) => d.ok).length;
    await this.db
      .update(reportRuns)
      .set({
        imagePath,
        pdfPath,
        deliveries,
        status: !recipients.length
          ? 'failed'
          : okCount === recipients.length
            ? 'sent'
            : okCount
              ? 'partial'
              : 'failed',
        error: !recipients.length ? 'Нет получателей' : null,
        sentAt: okCount ? new Date() : null,
      })
      .where(eq(reportRuns.id, run.id));
    return 'done';
  }

  async markFailed(runId: string, error: string): Promise<void> {
    await this.db
      .update(reportRuns)
      .set({ status: 'failed', error })
      .where(eq(reportRuns.id, runId));
  }

  async getSnapshot(runId: string): Promise<ReportSnapshot | null> {
    const [r] = await this.db
      .select({ snapshot: reportRuns.snapshot })
      .from(reportRuns)
      .where(eq(reportRuns.id, runId));
    return (r?.snapshot as ReportSnapshot | null) ?? null;
  }

  private async snapshot(
    ws: typeof workspaces.$inferSelect,
    report: Pick<typeof reports.$inferSelect, 'name' | 'config'>,
    slot: Date,
    sources: (typeof integrations.$inferSelect)[],
    dataNote: string | null,
    marketerId: string | null,
  ): Promise<ReportSnapshot> {
    const config = reportConfigSchema.parse(report.config);
    const period = reportPeriodRange(config.period, toDayKey(slot, ws.timezone));
    const len = Math.round((Date.parse(period.to) - Date.parse(period.from)) / 86_400_000) + 1;
    const prev = { from: shiftDay(period.from, -len), to: shiftDay(period.from, -1) };
    const meta = await this.metrics.metaConnected(ws.id);
    const [current, before, fx, creatives, funnel, marketer] = await Promise.all([
      this.metrics.counts(ws.id, period.from, period.to, meta),
      this.metrics.counts(ws.id, prev.from, prev.to, meta),
      this.metrics.fx(period.to),
      // Креативы решает формат: PDF — все за период, PNG — без них.
      config.format === 'pdf'
        ? this.metrics.creatives(ws.id, period.from, period.to, meta)
        : Promise.resolve([]),
      config.blocks.includes('funnel')
        ? this.insights.funnel(ws.id, period.from, period.to)
        : Promise.resolve(null),
      marketerId ? this.membership.memberEmail(ws.id, marketerId) : Promise.resolve(null),
    ]);
    const list = creatives
      .filter((c) => c.leads > 0 || (c.spendMinor ?? 0) > 0)
      .sort((a, b) => b.leads - a.leads || (b.spendMinor ?? 0) - (a.spendMinor ?? 0));
    const signed = await this.storage
      .signedUrls(
        PREVIEWS_BUCKET,
        list.flatMap((c) => (c.previewPath ? [c.previewPath] : [])),
        900,
      )
      .catch(() => new Map<string, string>());
    return {
      workspaceName: ws.name,
      reportName: report.name,
      period,
      generatedAt: new Date().toISOString(),
      timezone: ws.timezone,
      blocks: config.blocks,
      // Валюта — отдельным полем: в current/before только числа (иначе снимок не пройдёт схему).
      current: numbers(current),
      before: numbers(before),
      spendCurrency: current.spendCurrency,
      fxRate: fx?.rate ?? null,
      creatives: list.map((c) => ({
        title:
          c.adName ??
          (/^\d{10,}$/.test(c.adKey)
            ? `Объявление #…${c.adKey.slice(-6)}`
            : c.adKey.replace(/^utm:/, '') || 'Без объявления'),
        subtitle: [c.campaignName, c.adsetName].filter(Boolean).join(' › ') || null,
        leads: c.leads,
        sales: c.sales,
        spendMinor: c.spendMinor,
        cplMinor: c.cplFactMinor,
        previewUrl: (c.previewPath && signed.get(c.previewPath)) ?? null,
      })),
      funnel: funnel
        ? {
            conversations: funnel.conversations,
            wardLeads: funnel.wardLeads,
            withDeal: funnel.withDeal,
            sales: funnel.sales,
          }
        : null,
      sources: sources.map((s) => ({
        name: INTEGRATION_LABELS[s.type],
        at: s.lastSyncAt ? hhmm(s.lastSyncAt, ws.timezone) : null,
        ok: s.status !== 'error' && s.status !== 'reauth_required',
      })),
      dataNote,
      marketer,
    };
  }
}

/** Только числовые поля счётчиков — для снимка. */
function numbers(c: object): Record<string, number | null> {
  return Object.fromEntries(
    Object.entries(c).filter(([, v]) => v === null || typeof v === 'number'),
  ) as Record<string, number | null>;
}

/** Ближайший будущий слот (до 35 дней вперёд) — для «следующая отправка». */
export function nextSlot(
  schedule: ReturnType<typeof reportScheduleSchema.parse>,
  tz: string,
  now: Date,
): Date | null {
  const today = toDayKey(now, tz);
  for (let i = 0; i < 35; i++) {
    const day = shiftDay(today, i);
    const d = new Date(`${day}T12:00:00Z`);
    const weekday = ((d.getUTCDay() + 6) % 7) + 1;
    if (schedule.weekdays.length && !schedule.weekdays.includes(weekday)) continue;
    if (schedule.monthDays.length && !schedule.monthDays.includes(d.getUTCDate())) continue;
    const slots = schedule.times
      .map((t) => slotUtc(day, t, tz))
      .filter((s) => s > now)
      .sort((a, b) => +a - +b);
    if (slots[0]) return slots[0];
  }
  return null;
}
