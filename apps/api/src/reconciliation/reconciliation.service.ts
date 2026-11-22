import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  b24Contacts,
  b24Deals,
  b24Stages,
  type Db,
  integrations,
  leadOverrides,
  leads,
  metaAds,
  metaAdsets,
  metaCampaigns,
  metaInsightsDaily,
  metricsDaily,
  reconcileState,
  wardLeads,
  workspaces,
} from '@lidomer/db';
import { countingSettingsSchema, type DealStatus, defaultDealStatus } from '@lidomer/shared';
import { and, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { DB } from '../db/db.module';
import { buildMetrics } from './build-metrics';
import { type ReconcileContext, refreshLeads, type SourceChanges } from './incremental';
import { type OverrideIn, reconcile } from './reconcile';
import {
  contactColumns,
  dealColumns,
  DbReconcileStore,
  type Executor,
  insightColumns,
  toInsight,
  wardColumns,
} from './reconcile.store';

const BATCH = 1000;
/** Запас к водяному знаку: строка, изменённая в ещё не закрытой транзакции синхронизации. */
const MARGIN_MS = 5 * 60_000;
/** Полная пересборка — страховка раз в сутки. */
const FULL_EVERY_MS = 24 * 3_600_000;
/** Больше изменений (первая загрузка CRM) — дешевле одна полная пересборка. */
const MAX_PARTIAL_CHANGES = 2000;

export type RefreshMode = 'skip' | 'partial' | 'full';

/**
 * Пересборка журнала лидов и метрик компании из таблиц источников. `refresh` — после синхронизации:
 * только то, что изменилось (решение 0013); `rebuild` — полная, после ручных правок и настроек.
 */
@Injectable()
export class ReconciliationService {
  private readonly log = new Logger(ReconciliationService.name);

  constructor(@Inject(DB) private readonly db: Db) {}

  /** Учесть изменения источников с прошлой пересборки. Изменений нет — ничего не читает и не пишет. */
  async refresh(workspaceId: string): Promise<RefreshMode> {
    const db = this.db;
    const now = await this.dbNow();
    const [state] = await db
      .select()
      .from(reconcileState)
      .where(eq(reconcileState.workspaceId, workspaceId));
    const metaConnected = await this.metaConnected(workspaceId);
    let full: string | null = !state
      ? 'первая пересборка'
      : state.metaConnected !== metaConnected
        ? 'изменилось подключение Meta'
        : now.getTime() - state.fullAt.getTime() >= FULL_EVERY_MS
          ? 'раз в сутки'
          : null;

    if (state && !full) {
      const since = new Date(state.seenAt.getTime() - MARGIN_MS);
      const changes = await this.changes(workspaceId, since, metaConnected);
      if ('full' in changes) full = changes.full;
      else if (changes.wardIds.length + changes.dealIds.length > MAX_PARTIAL_CHANGES)
        full = 'много изменений';
      else {
        const res = await db.transaction(async (tx) => {
          const res = await refreshLeads(
            new DbReconcileStore(tx, workspaceId),
            changes,
            () => this.context(tx, workspaceId, metaConnected),
            metaConnected,
          );
          if (!('full' in res)) await this.saveState(tx, workspaceId, now, null, metaConnected);
          return res;
        });
        if ('full' in res) full = res.full;
        else {
          const touched = changes.wardIds.length + changes.dealIds.length + res.days;
          if (touched)
            this.log.log(
              `Сверка ${workspaceId} частично: лидов WARD ${changes.wardIds.length}, сделок ${changes.dealIds.length}, строк журнала ${res.leads}, дней метрик ${res.days}`,
            );
          return touched ? 'partial' : 'skip';
        }
      }
    }
    this.log.log(`Сверка ${workspaceId}: полная — ${full}`);
    await this.rebuild(workspaceId);
    return 'full';
  }

  /** Полная пересборка: весь журнал и все метрики компании. */
  async rebuild(workspaceId: string): Promise<{ leads: number; metrics: number }> {
    const db = this.db;
    const now = await this.dbNow();
    const [ws] = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId));
    if (!ws) return { leads: 0, metrics: 0 };
    const metaConnected = await this.metaConnected(workspaceId);
    const [ctx, ward, deals, contacts, insights] = await Promise.all([
      this.context(db, workspaceId, metaConnected),
      db.select(wardColumns).from(wardLeads).where(eq(wardLeads.workspaceId, workspaceId)),
      db.select(dealColumns).from(b24Deals).where(eq(b24Deals.workspaceId, workspaceId)),
      db.select(contactColumns).from(b24Contacts).where(eq(b24Contacts.workspaceId, workspaceId)),
      metaConnected
        ? db
            .select(insightColumns)
            .from(metaInsightsDaily)
            .where(eq(metaInsightsDaily.workspaceId, workspaceId))
        : null,
    ]);

    const rows = reconcile({
      ...ctx,
      wardLeads: ward,
      deals,
      contacts: new Map(contacts.map((c) => [c.id, c])),
    });
    const metrics = buildMetrics(rows, insights && insights.map(toInsight));

    await db.transaction(async (tx) => {
      await tx.delete(leads).where(eq(leads.workspaceId, workspaceId));
      for (let i = 0; i < rows.length; i += BATCH) {
        await tx.insert(leads).values(rows.slice(i, i + BATCH).map((r) => ({ ...r, workspaceId })));
      }
      await tx.delete(metricsDaily).where(eq(metricsDaily.workspaceId, workspaceId));
      for (let i = 0; i < metrics.length; i += BATCH) {
        await tx
          .insert(metricsDaily)
          .values(metrics.slice(i, i + BATCH).map((m) => ({ ...m, workspaceId })));
      }
      await this.saveState(tx, workspaceId, now, now, metaConnected);
    });
    this.log.log(`Сверка ${workspaceId}: лидов ${rows.length}, строк метрик ${metrics.length}`);
    return { leads: rows.length, metrics: metrics.length };
  }

  /** Время базы: с ним сравнивается `synced_at` источников. */
  private async dbNow(): Promise<Date> {
    const [row] = await this.db.execute<{ now: string }>(sql`select now()::text as now`);
    return new Date(row!.now);
  }

  private async metaConnected(workspaceId: string): Promise<boolean> {
    const rows = await this.db
      .select({ status: integrations.status })
      .from(integrations)
      .where(and(eq(integrations.workspaceId, workspaceId), eq(integrations.type, 'meta_ads')));
    return rows.some((m) => m.status !== 'disabled' && m.status !== 'not_connected');
  }

  /** Справочники сверки: пояс и правила компании, стадии, ручные правки, объявления Meta. */
  private async context(
    db: Executor,
    workspaceId: string,
    metaConnected: boolean,
  ): Promise<ReconcileContext> {
    const [[ws], stages, overrides, ads] = await Promise.all([
      db
        .select({ timezone: workspaces.timezone, settings: workspaces.settings })
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId)),
      db
        .select({
          stageId: b24Stages.stageId,
          mappedStatus: b24Stages.mappedStatus,
          semantics: b24Stages.semantics,
        })
        .from(b24Stages)
        .where(eq(b24Stages.workspaceId, workspaceId)),
      db
        .select({
          id: leadOverrides.id,
          leadId: leadOverrides.leadId,
          field: leadOverrides.field,
          value: leadOverrides.value,
        })
        .from(leadOverrides)
        .where(and(eq(leadOverrides.workspaceId, workspaceId), isNull(leadOverrides.revokedAt)))
        .orderBy(leadOverrides.createdAt),
      metaConnected
        ? db
            .select({
              id: metaAds.id,
              name: metaAds.name,
              campaignName: metaCampaigns.name,
              adsetName: metaAdsets.name,
            })
            .from(metaAds)
            .leftJoin(
              metaCampaigns,
              and(
                eq(metaCampaigns.workspaceId, workspaceId),
                eq(metaCampaigns.id, metaAds.campaignId),
              ),
            )
            .leftJoin(
              metaAdsets,
              and(eq(metaAdsets.workspaceId, workspaceId), eq(metaAdsets.id, metaAds.adsetId)),
            )
            .where(eq(metaAds.workspaceId, workspaceId))
        : null,
    ]);
    if (!ws) throw new Error(`Компания ${workspaceId} не найдена`);
    return {
      timezone: ws.timezone,
      settings: countingSettingsSchema.parse(
        (ws.settings as { counting?: unknown } | null)?.counting ?? {},
      ),
      stageStatus: new Map<string, DealStatus>(
        stages.map((s) => [s.stageId, s.mappedStatus ?? defaultDealStatus(s.semantics)]),
      ),
      overrides: overrides as OverrideIn[],
      metaAds: ads,
    };
  }

  /**
   * Что изменилось в источниках после `since` (по `synced_at`, см. `onlyChanged`). Стадии и структура
   * Meta влияют на любой лид — тогда `{ full }`.
   */
  private async changes(
    workspaceId: string,
    since: Date,
    metaConnected: boolean,
  ): Promise<SourceChanges | { full: string }> {
    const db = this.db;
    const changedSince = (
      t: typeof b24Stages | typeof metaAds | typeof metaCampaigns | typeof metaAdsets,
    ) =>
      db
        .select({ one: sql`1` })
        .from(t)
        .where(
          and(
            eq(t.workspaceId, workspaceId),
            gt('syncedAt' in t ? t.syncedAt : t.updatedAt, since),
          ),
        )
        .limit(1)
        .then((rows) => rows.length > 0);
    const [stagesChanged, ...metaChanged] = await Promise.all([
      changedSince(b24Stages),
      ...(metaConnected ? [metaAds, metaCampaigns, metaAdsets].map(changedSince) : []),
    ]);
    if (stagesChanged) return { full: 'изменились стадии Bitrix24' };
    if (metaChanged.some(Boolean)) return { full: 'изменились объявления Meta' };

    const changedContacts = db
      .select({ id: b24Contacts.id })
      .from(b24Contacts)
      .where(and(eq(b24Contacts.workspaceId, workspaceId), gt(b24Contacts.syncedAt, since)));
    const [ward, deals, contactDeals, days] = await Promise.all([
      db
        .select({ id: wardLeads.id })
        .from(wardLeads)
        .where(and(eq(wardLeads.workspaceId, workspaceId), gt(wardLeads.syncedAt, since))),
      db
        .select({ id: b24Deals.id })
        .from(b24Deals)
        .where(and(eq(b24Deals.workspaceId, workspaceId), gt(b24Deals.syncedAt, since))),
      db
        .select({ id: b24Deals.id })
        .from(b24Deals)
        .where(
          and(eq(b24Deals.workspaceId, workspaceId), inArray(b24Deals.contactId, changedContacts)),
        ),
      metaConnected
        ? db
            .selectDistinct({ day: metaInsightsDaily.day })
            .from(metaInsightsDaily)
            .where(
              and(
                eq(metaInsightsDaily.workspaceId, workspaceId),
                gt(metaInsightsDaily.syncedAt, since),
              ),
            )
        : [],
    ]);
    return {
      wardIds: ward.map((w) => w.id),
      dealIds: [...new Set([...deals, ...contactDeals].map((d) => d.id))],
      insightDays: days.map((d) => d.day),
    };
  }

  private async saveState(
    db: Executor,
    workspaceId: string,
    seenAt: Date,
    fullAt: Date | null,
    metaConnected: boolean,
  ) {
    await db
      .insert(reconcileState)
      .values({ workspaceId, seenAt, fullAt: fullAt ?? seenAt, metaConnected })
      .onConflictDoUpdate({
        target: reconcileState.workspaceId,
        set: fullAt ? { seenAt, fullAt, metaConnected } : { seenAt, metaConnected },
      });
  }
}
