import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Patch,
  Put,
  Query,
} from '@nestjs/common';
import { type Db, workspaces } from '@lidomer/db';
import {
  can,
  type CountingResponse,
  type CountingSettings,
  countingSettingsSchema,
  type CreateOverrideRequest,
  createOverrideRequestSchema,
  type LeadChannel,
  leadChannelSchema,
  type LeadDetailResponse,
  type LeadItem,
  type LeadsQuery,
  leadsQuerySchema,
  maskPhone,
  periodSchema,
  shiftDay,
  type SummaryResponse,
  type UpdateWorkspaceRequest,
  updateWorkspaceRequestSchema,
} from '@lidomer/shared';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { CurrentUser, CurrentWorkspace, RequirePermission } from '../auth/decorators';
import type { AuthUser, WorkspaceContext } from '../common/request';
import { ZodPipe } from '../common/zod.pipe';
import { DB } from '../db/db.module';
import { MembershipRepository } from '../workspaces/membership.repository';
import { MetricsRepository, preliminaryFrom } from './metrics.repository';
import { InsightsRepository } from './insights.repository';
import { ReconciliationService } from './reconciliation.service';
import { buildTimeline } from './timeline';
import { PREVIEWS_BUCKET, Storage } from '../common/storage';
import { ENV, type Env } from '../config/env';

const periodQuery = new ZodPipe(periodSchema);
const periodWithChannel = z
  .object({ from: z.string(), to: z.string(), channel: leadChannelSchema.optional() })
  .refine((p) => periodSchema.safeParse(p).success, 'Неверный период');

/** Наблюдатель видит телефоны в маске. */
function protect(item: LeadItem, ws: WorkspaceContext): LeadItem {
  return can(ws.role, 'leads:read_contacts') ? item : { ...item, phone: maskPhone(item.phone) };
}

@Controller()
export class MetricsController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(MetricsRepository) private readonly repo: MetricsRepository,
    @Inject(ReconciliationService) private readonly reconciliation: ReconciliationService,
    @Inject(MembershipRepository) private readonly membership: MembershipRepository,
    @Inject(InsightsRepository) private readonly insights: InsightsRepository,
    @Inject(ENV) env: Env,
  ) {
    this.storage = new Storage(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  }

  private readonly storage: Storage;

  private async timezone(workspaceId: string): Promise<string> {
    const [ws] = await this.db
      .select({ tz: workspaces.timezone })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId));
    return ws?.tz ?? 'Asia/Bishkek';
  }

  /** Ключевые цифры периода и прошлого периода той же длины. */
  @Get('metrics/summary')
  @RequirePermission('metrics:read')
  async summary(
    @CurrentWorkspace() ws: WorkspaceContext,
    @Query(periodQuery) p: { from: string; to: string },
  ): Promise<SummaryResponse> {
    const len =
      Math.round(
        (Date.parse(`${p.to}T00:00:00Z`) - Date.parse(`${p.from}T00:00:00Z`)) / 86_400_000,
      ) + 1;
    const previous = { from: shiftDay(p.from, -len), to: shiftDay(p.from, -1) };
    const meta = await this.repo.metaConnected(ws.workspaceId);
    const [current, before, fx, sources, tz, journal] = await Promise.all([
      this.repo.counts(ws.workspaceId, p.from, p.to, meta),
      this.repo.counts(ws.workspaceId, previous.from, previous.to, meta),
      this.repo.fx(p.to),
      this.repo.sources(ws.workspaceId),
      this.timezone(ws.workspaceId),
      this.repo.journal(ws.workspaceId),
    ]);
    return {
      period: p,
      previous,
      current,
      before,
      fx,
      sources: sources.map((s) => ({ ...s, lastSyncAt: s.lastSyncAt?.toISOString() ?? null })),
      journal: { updatedAt: journal.updatedAt?.toISOString() ?? null, stale: journal.stale },
      preliminaryFrom: preliminaryFrom(p.from, p.to, tz),
    };
  }

  @Get('metrics/daily')
  @RequirePermission('metrics:read')
  async daily(
    @CurrentWorkspace() ws: WorkspaceContext,
    @Query(periodQuery) p: { from: string; to: string },
  ) {
    const meta = await this.repo.metaConnected(ws.workspaceId);
    return { points: await this.repo.daily(ws.workspaceId, p.from, p.to, meta) };
  }

  /** Журнал лидов. С `metric` — «из чего сложилась» цифра: ровно те лиды, что её дали. */
  @Get('leads')
  @RequirePermission('leads:read')
  async leads(
    @CurrentWorkspace() ws: WorkspaceContext,
    @Query(new ZodPipe(leadsQuerySchema)) q: LeadsQuery,
  ) {
    const res = await this.repo.listLeads(ws.workspaceId, q);
    return { total: res.total, items: res.items.map((i) => protect(i, ws)) };
  }

  @Get('leads/:id')
  @RequirePermission('leads:read')
  async lead(
    @CurrentWorkspace() ws: WorkspaceContext,
    @Param('id', new ZodPipe(z.string().max(64))) id: string,
  ): Promise<LeadDetailResponse> {
    const res = await this.repo.getLead(ws.workspaceId, id);
    if (!res) throw new NotFoundException('Лид не найден');
    const overrides = res.overrides.map((o) => ({
      id: o.id,
      field: o.field,
      value: o.value,
      reason: o.reason,
      createdAt: o.createdAt.toISOString(),
      revokedAt: o.revokedAt?.toISOString() ?? null,
    }));
    const src = await this.insights.leadSources(
      ws.workspaceId,
      res.item.wardLeadId,
      res.item.dealId,
    );
    const item = protect(res.item, ws);
    return {
      item,
      sourceText: src.ward?.sourceText ?? null,
      facts: (src.ward?.facts as Record<string, unknown> | null) ?? null,
      timeline: buildTimeline(item, src, overrides),
      overrides,
      contacts: res.contacts,
    };
  }

  @Get('insights/heatmap')
  @RequirePermission('metrics:read')
  heatmap(
    @CurrentWorkspace() ws: WorkspaceContext,
    @Query(new ZodPipe(periodWithChannel)) p: { from: string; to: string; channel?: LeadChannel },
  ) {
    return this.insights.heatmap(ws.workspaceId, p.from, p.to, p.channel);
  }

  @Get('insights/asks')
  @RequirePermission('metrics:read')
  asks(
    @CurrentWorkspace() ws: WorkspaceContext,
    @Query(periodQuery) p: { from: string; to: string },
  ) {
    return this.insights.asks(ws.workspaceId, p.from, p.to);
  }

  @Get('metrics/funnel')
  @RequirePermission('metrics:read')
  funnel(
    @CurrentWorkspace() ws: WorkspaceContext,
    @Query(periodQuery) p: { from: string; to: string },
  ) {
    return this.insights.funnel(ws.workspaceId, p.from, p.to);
  }

  /** Компания: название и часовой пояс. Смена пояса пересчитывает дни лидов. */
  @Patch('workspace')
  @RequirePermission('settings:manage')
  async updateWorkspace(
    @CurrentUser() user: AuthUser,
    @CurrentWorkspace() ws: WorkspaceContext,
    @Body(new ZodPipe(updateWorkspaceRequestSchema)) body: UpdateWorkspaceRequest,
  ): Promise<void> {
    const [before] = await this.db
      .select({ name: workspaces.name, timezone: workspaces.timezone })
      .from(workspaces)
      .where(eq(workspaces.id, ws.workspaceId));
    await this.db.update(workspaces).set(body).where(eq(workspaces.id, ws.workspaceId));
    await this.membership.audit({
      workspaceId: ws.workspaceId,
      actorUserId: user.id,
      action: 'workspace.update',
      entityType: 'workspace',
      entityId: ws.workspaceId,
      before,
      after: body,
    });
    if (before?.timezone !== body.timezone) await this.reconciliation.rebuild(ws.workspaceId);
  }

  /** Ручное решение по лиду: источники не меняются, правка с автором и причиной. */
  @Post('leads/:id/overrides')
  @HttpCode(204)
  @RequirePermission('leads:override')
  async override(
    @CurrentUser() user: AuthUser,
    @CurrentWorkspace() ws: WorkspaceContext,
    @Param('id', new ZodPipe(z.string().max(64))) id: string,
    @Body(new ZodPipe(createOverrideRequestSchema)) body: CreateOverrideRequest,
  ): Promise<void> {
    if (!(await this.repo.leadExists(ws.workspaceId, id)))
      throw new NotFoundException('Лид не найден');
    await this.repo.addOverride({
      workspaceId: ws.workspaceId,
      leadId: id,
      ...body,
      authorId: user.id,
    });
    await this.membership.audit({
      workspaceId: ws.workspaceId,
      actorUserId: user.id,
      action: 'lead.override',
      entityType: 'lead',
      entityId: id,
      after: body,
      reason: body.reason,
    });
    await this.reconciliation.rebuild(ws.workspaceId);
  }

  @Get('creatives')
  @RequirePermission('metrics:read')
  async creatives(
    @CurrentWorkspace() ws: WorkspaceContext,
    @Query(periodQuery) p: { from: string; to: string },
  ) {
    const meta = await this.repo.metaConnected(ws.workspaceId);
    const [rows, counts] = await Promise.all([
      this.repo.creatives(ws.workspaceId, p.from, p.to, meta),
      this.repo.counts(ws.workspaceId, p.from, p.to, meta),
    ]);
    // Превью — подписанные ссылки одним запросом к Storage (бакет закрытый).
    const urls = await this.storage
      .signedUrls(
        PREVIEWS_BUCKET,
        rows.flatMap((r) => (r.previewPath ? [r.previewPath] : [])),
      )
      .catch(() => new Map<string, string>());
    const items = rows.map(({ previewPath, ...r }) => ({
      ...r,
      previewUrl: (previewPath && urls.get(previewPath)) ?? null,
    }));
    return { items, spendCurrency: counts.spendCurrency };
  }

  /** Правила подсчёта: окно дублей, какие источники Bitrix24 — реклама, какие не считать, какие воронки — не лиды. */
  @Get('settings/counting')
  @RequirePermission('metrics:read')
  async counting(@CurrentWorkspace() ws: WorkspaceContext): Promise<CountingResponse> {
    return {
      settings: await this.countingOf(ws.workspaceId),
      bitrixSources: await this.repo.bitrixSources(ws.workspaceId),
      bitrixCategories: await this.repo.bitrixCategories(ws.workspaceId),
    };
  }

  @Put('settings/counting')
  @RequirePermission('settings:manage')
  async saveCounting(
    @CurrentUser() user: AuthUser,
    @CurrentWorkspace() ws: WorkspaceContext,
    @Body(new ZodPipe(countingSettingsSchema)) body: CountingSettings,
  ): Promise<CountingResponse> {
    const before = await this.countingOf(ws.workspaceId);
    const [row] = await this.db
      .select({ settings: workspaces.settings })
      .from(workspaces)
      .where(eq(workspaces.id, ws.workspaceId));
    await this.db
      .update(workspaces)
      .set({ settings: { ...((row?.settings as object) ?? {}), counting: body } })
      .where(eq(workspaces.id, ws.workspaceId));
    await this.membership.audit({
      workspaceId: ws.workspaceId,
      actorUserId: user.id,
      action: 'settings.counting',
      entityType: 'workspace',
      entityId: ws.workspaceId,
      before,
      after: body,
    });
    await this.reconciliation.rebuild(ws.workspaceId);
    return this.counting(ws);
  }

  @Post('reconciliation/rebuild')
  @HttpCode(200)
  @RequirePermission('integrations:manage')
  rebuild(@CurrentWorkspace() ws: WorkspaceContext) {
    return this.reconciliation.rebuild(ws.workspaceId);
  }

  private async countingOf(workspaceId: string): Promise<CountingSettings> {
    const [row] = await this.db
      .select({ settings: workspaces.settings })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId));
    return countingSettingsSchema.parse(
      (row?.settings as { counting?: unknown } | null)?.counting ?? {},
    );
  }
}
