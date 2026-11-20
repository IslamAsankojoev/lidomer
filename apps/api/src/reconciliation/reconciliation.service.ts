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
  wardLeads,
  workspaces,
} from '@lidomer/db';
import { countingSettingsSchema, type DealStatus, defaultDealStatus } from '@lidomer/shared';
import { and, eq, isNull } from 'drizzle-orm';
import { DB } from '../db/db.module';
import { buildMetrics } from './build-metrics';
import { type OverrideIn, reconcile } from './reconcile';

const BATCH = 1000;

/**
 * Пересборка журнала лидов и метрик компании из таблиц источников. Полная: данных — тысячи строк,
 * пересчёт идёт секунды, а частичный пересчёт «за изменившиеся дни» усложнил бы код без выигрыша.
 */
@Injectable()
export class ReconciliationService {
  private readonly log = new Logger(ReconciliationService.name);

  constructor(@Inject(DB) private readonly db: Db) {}

  async rebuild(workspaceId: string): Promise<{ leads: number; metrics: number }> {
    const db = this.db;
    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
    if (!ws) return { leads: 0, metrics: 0 };
    const settings = countingSettingsSchema.parse(
      (ws.settings as { counting?: unknown } | null)?.counting ?? {},
    );

    const [ward, deals, contacts, stages, overrides, metaIntegration] = await Promise.all([
      db.select().from(wardLeads).where(eq(wardLeads.workspaceId, workspaceId)),
      db.select().from(b24Deals).where(eq(b24Deals.workspaceId, workspaceId)),
      db
        .select({ id: b24Contacts.id, name: b24Contacts.name, phone: b24Contacts.phone })
        .from(b24Contacts)
        .where(eq(b24Contacts.workspaceId, workspaceId)),
      db.select().from(b24Stages).where(eq(b24Stages.workspaceId, workspaceId)),
      db
        .select()
        .from(leadOverrides)
        .where(and(eq(leadOverrides.workspaceId, workspaceId), isNull(leadOverrides.revokedAt)))
        .orderBy(leadOverrides.createdAt),
      db
        .select({ status: integrations.status })
        .from(integrations)
        .where(and(eq(integrations.workspaceId, workspaceId), eq(integrations.type, 'meta_ads'))),
    ]);
    const metaConnected = metaIntegration.some(
      (m) => m.status !== 'disabled' && m.status !== 'not_connected',
    );
    const [adIds, insights] = metaConnected
      ? await Promise.all([
          db
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
            .where(eq(metaAds.workspaceId, workspaceId)),
          db.select().from(metaInsightsDaily).where(eq(metaInsightsDaily.workspaceId, workspaceId)),
        ])
      : [[], null];

    const rows = reconcile({
      timezone: ws.timezone,
      settings,
      wardLeads: ward,
      deals,
      contacts: new Map(contacts.map((c) => [c.id, c])),
      stageStatus: new Map<string, DealStatus>(
        stages.map((s) => [s.stageId, s.mappedStatus ?? defaultDealStatus(s.semantics)]),
      ),
      overrides: overrides as OverrideIn[],
      metaAds: metaConnected ? adIds : null,
    });
    const metrics = buildMetrics(
      rows,
      insights &&
        insights.map((i) => ({
          adId: i.adId,
          day: i.day,
          spendMinor: i.spendMinor,
          currency: i.currency,
          actions: i.actions as { action_type: string; value: string }[],
        })),
    );

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
    });
    this.log.log(`Сверка ${workspaceId}: лидов ${rows.length}, строк метрик ${metrics.length}`);
    return { leads: rows.length, metrics: metrics.length };
  }
}
