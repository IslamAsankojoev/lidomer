import { Inject, Injectable } from '@nestjs/common';
import {
  b24Deals,
  b24Stages,
  type Db,
  fxRates,
  integrations,
  leadOverrides,
  leads,
  metricsDaily,
  rawPayloads,
  metaAds,
  metaAdsets,
  metaCampaigns,
} from '@lidomer/db';
import {
  costPerLead,
  type Counts,
  type LeadItem,
  type LeadFlag,
  type LeadMetric,
  type LeadsQuery,
  LEAD_FLAGS,
  shiftDay,
  today,
} from '@lidomer/shared';
import {
  and,
  asc,
  between,
  count,
  desc,
  eq,
  gte,
  isNotNull,
  lte,
  not,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { DB } from '../db/db.module';
import { loadJournalHealth } from './journal-health';

export interface DailyPoint {
  day: string;
  adLeads: number;
  organicLeads: number;
  directUnknownLeads: number;
  otherLeads: number;
  sales: number;
  spendMinor: number | null;
}

/** Условие на журнал лидов для метрики — то же правило, что в buildMetrics. */
export function metricCondition(metric: LeadMetric): SQL | undefined {
  switch (metric) {
    case 'adLeads':
      return eq(leads.channel, 'ad');
    case 'organicLeads':
      return eq(leads.channel, 'organic');
    case 'directUnknownLeads':
      return eq(leads.channel, 'direct_unknown');
    case 'otherLeads':
      return eq(leads.channel, 'other');
    case 'totalLeads':
      return undefined;
    case 'repeats':
      return eq(leads.isRepeat, true);
    case 'withPhone':
      return isNotNull(leads.phone);
    case 'sales':
      return eq(leads.status, 'won');
  }
}

@Injectable()
export class MetricsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async metaConnected(workspaceId: string): Promise<boolean> {
    const rows = await this.db
      .select({ status: integrations.status })
      .from(integrations)
      .where(and(eq(integrations.workspaceId, workspaceId), eq(integrations.type, 'meta_ads')));
    return rows.some((r) => r.status !== 'disabled' && r.status !== 'not_connected');
  }

  async counts(
    workspaceId: string,
    from: string,
    to: string,
    metaConnected: boolean,
  ): Promise<Counts> {
    const m = metricsDaily;
    const [r] = await this.db
      .select({
        ad: sql<number>`coalesce(sum(${m.leads}) filter (where ${m.channel} = 'ad'), 0)::int`,
        organic: sql<number>`coalesce(sum(${m.leads}) filter (where ${m.channel} = 'organic'), 0)::int`,
        direct: sql<number>`coalesce(sum(${m.leads}) filter (where ${m.channel} = 'direct_unknown'), 0)::int`,
        other: sql<number>`coalesce(sum(${m.leads}) filter (where ${m.channel} = 'other'), 0)::int`,
        repeats: sql<number>`coalesce(sum(${m.repeats}), 0)::int`,
        withPhone: sql<number>`coalesce(sum(${m.withPhone}), 0)::int`,
        sales: sql<number>`coalesce(sum(${m.sales}), 0)::int`,
        amount: sql<number>`coalesce(sum(${m.salesAmountMinor}), 0)::bigint`,
        spend: sql<number>`coalesce(sum(${m.spendMinor}), 0)::bigint`,
        currency: sql<string | null>`max(${m.spendCurrency})`,
        metaLeads: sql<number>`coalesce(sum(${m.metaLeads}), 0)::int`,
      })
      .from(m)
      .where(and(eq(m.workspaceId, workspaceId), between(m.day, from, to)));
    const spend = metaConnected ? Number(r!.spend) : null;
    const metaLeads = metaConnected ? r!.metaLeads : null;
    return {
      adLeads: r!.ad,
      organicLeads: r!.organic,
      directUnknownLeads: r!.direct,
      otherLeads: r!.other,
      totalLeads: r!.ad + r!.organic + r!.direct + r!.other,
      repeats: r!.repeats,
      withPhone: r!.withPhone,
      sales: r!.sales,
      salesAmountMinor: Number(r!.amount),
      spendMinor: spend,
      spendCurrency: metaConnected ? r!.currency : null,
      metaLeads,
      cplFactMinor: costPerLead(spend, r!.ad),
      cplMetaMinor: costPerLead(spend, metaLeads),
    };
  }

  async daily(workspaceId: string, from: string, to: string, metaConnected: boolean) {
    const m = metricsDaily;
    const rows = await this.db
      .select({
        day: m.day,
        ad: sql<number>`coalesce(sum(${m.leads}) filter (where ${m.channel} = 'ad'), 0)::int`,
        organic: sql<number>`coalesce(sum(${m.leads}) filter (where ${m.channel} = 'organic'), 0)::int`,
        direct: sql<number>`coalesce(sum(${m.leads}) filter (where ${m.channel} = 'direct_unknown'), 0)::int`,
        other: sql<number>`coalesce(sum(${m.leads}) filter (where ${m.channel} = 'other'), 0)::int`,
        sales: sql<number>`coalesce(sum(${m.sales}), 0)::int`,
        spend: sql<number>`coalesce(sum(${m.spendMinor}), 0)::bigint`,
      })
      .from(m)
      .where(and(eq(m.workspaceId, workspaceId), between(m.day, from, to)))
      .groupBy(m.day);
    const byDay = new Map(rows.map((r) => [r.day, r]));
    // Все дни периода, включая пустые: пустой день — 0 лидов (источники ответили), а не пропуск.
    const points: DailyPoint[] = [];
    for (let d = from; d <= to; d = shiftDay(d, 1)) {
      const r = byDay.get(d);
      points.push({
        day: d,
        adLeads: r?.ad ?? 0,
        organicLeads: r?.organic ?? 0,
        directUnknownLeads: r?.direct ?? 0,
        otherLeads: r?.other ?? 0,
        sales: r?.sales ?? 0,
        spendMinor: metaConnected ? Number(r?.spend ?? 0) : null,
      });
    }
    return points;
  }

  async fx(to: string) {
    const [onOrBefore] = await this.db
      .select()
      .from(fxRates)
      .where(and(eq(fxRates.currency, 'USD'), lte(fxRates.day, to)))
      .orderBy(desc(fxRates.day))
      .limit(1);
    const [after] = onOrBefore
      ? [onOrBefore]
      : await this.db
          .select()
          .from(fxRates)
          .where(and(eq(fxRates.currency, 'USD'), gte(fxRates.day, to)))
          .orderBy(asc(fxRates.day))
          .limit(1);
    return after ? { rate: Number(after.rate), source: after.source, day: after.day } : null;
  }

  journal(workspaceId: string) {
    return loadJournalHealth(this.db, workspaceId);
  }

  sources(workspaceId: string) {
    return this.db
      .select({
        type: integrations.type,
        status: integrations.status,
        lastSyncAt: integrations.lastSyncAt,
      })
      .from(integrations)
      .where(eq(integrations.workspaceId, workspaceId));
  }

  async listLeads(
    workspaceId: string,
    q: LeadsQuery,
  ): Promise<{ items: LeadItem[]; total: number }> {
    const conds: (SQL | undefined)[] = [
      eq(leads.workspaceId, workspaceId),
      between(leads.day, q.from, q.to),
    ];
    if (q.metric) conds.push(metricCondition(q.metric));
    if (q.channel) conds.push(eq(leads.channel, q.channel));
    if (q.status) conds.push(eq(leads.status, q.status));
    if (q.flag) conds.push(sql`${q.flag} = any(${leads.flags})`);
    if (q.hasPhone === 'yes') conds.push(isNotNull(leads.phone));
    if (q.hasPhone === 'no') conds.push(not(isNotNull(leads.phone)));
    if (q.adKey) conds.push(eq(leads.adKey, q.adKey));
    const where = and(...conds);

    const [{ total }] = (await this.db.select({ total: count() }).from(leads).where(where)) as [
      { total: number },
    ];
    const rows = await this.db
      .select({
        lead: leads,
        stageName: b24Stages.name,
      })
      .from(leads)
      .leftJoin(
        b24Deals,
        and(eq(b24Deals.workspaceId, leads.workspaceId), eq(b24Deals.id, leads.dealId)),
      )
      .leftJoin(
        b24Stages,
        and(
          eq(b24Stages.workspaceId, b24Deals.workspaceId),
          eq(b24Stages.stageId, b24Deals.stageId),
        ),
      )
      .where(where)
      .orderBy(desc(leads.createdAt), asc(leads.id))
      .limit(q.limit)
      .offset(q.offset);
    return { total, items: rows.map((r) => toItem(r.lead, r.stageName)) };
  }

  async getLead(workspaceId: string, id: string) {
    const [row] = await this.db
      .select({ lead: leads, stageName: b24Stages.name })
      .from(leads)
      .leftJoin(
        b24Deals,
        and(eq(b24Deals.workspaceId, leads.workspaceId), eq(b24Deals.id, leads.dealId)),
      )
      .leftJoin(
        b24Stages,
        and(
          eq(b24Stages.workspaceId, b24Deals.workspaceId),
          eq(b24Stages.stageId, b24Deals.stageId),
        ),
      )
      .where(and(eq(leads.workspaceId, workspaceId), eq(leads.id, id)));
    if (!row) return null;
    const history = await this.db
      .select()
      .from(leadOverrides)
      .where(and(eq(leadOverrides.workspaceId, workspaceId), eq(leadOverrides.leadId, id)))
      .orderBy(desc(leadOverrides.createdAt));
    return {
      item: toItem(row.lead, row.stageName),
      overrides: history,
      contacts: await this.contactsOf(workspaceId, row.lead.repeatOf ?? row.lead.id),
    };
  }

  /** Обращения клиента: первое (`first`) и все строки, помеченные его повтором. */
  private async contactsOf(workspaceId: string, first: string) {
    const rows = await this.db
      .select({
        id: leads.id,
        createdAt: leads.createdAt,
        channel: leads.channel,
        adName: leads.adName,
        status: leads.status,
        isRepeat: leads.isRepeat,
      })
      .from(leads)
      .where(
        and(eq(leads.workspaceId, workspaceId), or(eq(leads.id, first), eq(leads.repeatOf, first))),
      )
      .orderBy(asc(leads.createdAt), asc(leads.id));
    return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
  }

  async addOverride(input: typeof leadOverrides.$inferInsert): Promise<void> {
    await this.db.insert(leadOverrides).values(input);
  }

  async leadExists(workspaceId: string, id: string): Promise<boolean> {
    const [r] = await this.db
      .select({ id: leads.id })
      .from(leads)
      .where(and(eq(leads.workspaceId, workspaceId), eq(leads.id, id)));
    return !!r;
  }

  /** Объявления за период: лиды, продажи, расход — из metrics_daily; названия — из журнала. */
  async creatives(workspaceId: string, from: string, to: string, metaConnected: boolean) {
    const m = metricsDaily;
    const rows = await this.db
      .select({
        adKey: m.adKey,
        leads: sql<number>`sum(${m.leads})::int`,
        sales: sql<number>`sum(${m.sales})::int`,
        withPhone: sql<number>`sum(${m.withPhone})::int`,
        // null — по объявлению нет данных Meta (лиды по UTM без привязки): это не ноль расхода.
        spend: sql<number | null>`sum(${m.spendMinor})::bigint`,
        metaLeads: sql<number | null>`sum(${m.metaLeads})::int`,
      })
      .from(m)
      .where(and(eq(m.workspaceId, workspaceId), eq(m.channel, 'ad'), between(m.day, from, to)))
      .groupBy(m.adKey);
    // Названия и превью объявлений Meta — для строк, у которых в журнале лидов названий нет.
    const ads = metaConnected
      ? await this.db
          .select({
            id: metaAds.id,
            name: metaAds.name,
            previewPath: metaAds.previewPath,
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
      : [];
    const adById = new Map(ads.map((a) => [a.id, a]));
    const names = await this.db
      .select({
        adKey: leads.adKey,
        adName: sql<string | null>`max(${leads.adName})`,
        campaignName: sql<string | null>`max(${leads.campaignName})`,
        adsetName: sql<string | null>`max(${leads.adsetName})`,
      })
      .from(leads)
      .where(and(eq(leads.workspaceId, workspaceId), eq(leads.channel, 'ad')))
      .groupBy(leads.adKey);
    const byKey = new Map(names.map((n) => [n.adKey ?? '', n]));
    return rows
      .map((r) => {
        const spend = metaConnected && r.spend !== null ? Number(r.spend) : null;
        const n = byKey.get(r.adKey);
        const ad = adById.get(r.adKey);
        return {
          adKey: r.adKey,
          adName: ad?.name ?? n?.adName ?? null,
          campaignName: ad?.campaignName ?? n?.campaignName ?? null,
          adsetName: ad?.adsetName ?? n?.adsetName ?? null,
          leads: r.leads,
          withPhone: r.withPhone,
          sales: r.sales,
          spendMinor: spend,
          metaLeads: metaConnected && r.metaLeads !== null ? r.metaLeads : null,
          previewPath: ad?.previewPath ?? null,
          cplFactMinor: costPerLead(spend, r.leads),
        };
      })
      .sort((a, b) => b.leads - a.leads);
  }

  /** Источники сделок Bitrix24 с названиями (из последнего ответа crm.status.list) и числом сделок. */
  /** Воронки Bitrix24 (по стадиям) и сколько в них сделок за 30 дней. */
  async bitrixCategories(workspaceId: string) {
    const since = new Date(Date.now() - 30 * 86_400_000);
    const [cats, counts] = await Promise.all([
      this.db
        .select({
          id: b24Stages.categoryId,
          name: sql<string | null>`max(${b24Stages.categoryName})`,
        })
        .from(b24Stages)
        .where(eq(b24Stages.workspaceId, workspaceId))
        .groupBy(b24Stages.categoryId),
      this.db
        .select({
          id: sql<number>`coalesce(${b24Deals.categoryId}, 0)::int`,
          deals: sql<number>`count(*)::int`,
        })
        .from(b24Deals)
        .where(and(eq(b24Deals.workspaceId, workspaceId), gte(b24Deals.createdAt, since)))
        .groupBy(sql`1`),
    ]);
    const deals = new Map(counts.map((c) => [c.id, c.deals]));
    return cats
      .map((c) => ({
        id: c.id,
        name: c.name ?? (c.id === 0 ? 'Основная воронка' : `Воронка ${c.id}`),
        deals30d: deals.get(c.id) ?? 0,
      }))
      .sort((a, b) => a.id - b.id);
  }

  async bitrixSources(workspaceId: string) {
    const [raw] = await this.db
      .select({ response: rawPayloads.response })
      .from(rawPayloads)
      .where(
        and(eq(rawPayloads.workspaceId, workspaceId), eq(rawPayloads.endpoint, 'crm.status.list')),
      )
      .orderBy(desc(rawPayloads.fetchedAt))
      .limit(1);
    const names = new Map<string, string>();
    const items = (
      raw?.response as { result?: { ENTITY_ID: string; STATUS_ID: string; NAME: string }[] } | null
    )?.result;
    for (const i of items ?? []) if (i.ENTITY_ID === 'SOURCE') names.set(i.STATUS_ID, i.NAME);
    const since = new Date(Date.now() - 30 * 86_400_000);
    const counts = await this.db
      .select({
        id: b24Deals.sourceId,
        deals: sql<number>`count(*)::int`,
        withUtm: sql<number>`count(${b24Deals.utmSource})::int`,
      })
      .from(b24Deals)
      .where(
        and(
          eq(b24Deals.workspaceId, workspaceId),
          gte(b24Deals.createdAt, since),
          isNotNull(b24Deals.sourceId),
        ),
      )
      .groupBy(b24Deals.sourceId);
    return counts
      .map((c) => ({
        id: c.id!,
        name: names.get(c.id!) ?? c.id!,
        deals30d: c.deals,
        withUtm30d: c.withUtm,
      }))
      .sort((a, b) => b.deals30d - a.deals30d);
  }
}

/** Последние 7 дней — предварительные: статусы и расход ещё меняются. */
export function preliminaryFrom(from: string, to: string, timezone: string): string | null {
  const start = shiftDay(today(timezone), -6);
  if (to < start) return null;
  return from > start ? from : start;
}

const KNOWN_FLAGS = new Set<string>(LEAD_FLAGS);
const isLeadFlag = (f: string): f is LeadFlag => KNOWN_FLAGS.has(f);

function toItem(l: typeof leads.$inferSelect, stageName: string | null): LeadItem {
  return {
    id: l.id,
    origin: l.origin as LeadItem['origin'],
    createdAt: l.createdAt.toISOString(),
    day: l.day,
    name: l.name,
    phone: l.phone,
    instagram: l.instagram,
    channel: l.channel,
    adKey: l.adKey,
    adName: l.adName,
    campaignName: l.campaignName,
    adsetName: l.adsetName,
    postId: l.postId,
    wardLeadId: l.wardLeadId,
    dealId: l.dealId,
    stageName,
    status: l.status,
    amountMinor: l.amountMinor,
    currency: l.currency,
    isRepeat: l.isRepeat,
    repeatOf: l.repeatOf,
    // Флаг, которого больше нет в правилах (старая строка до пересборки), — не отдаём.
    flags: l.flags.filter(isLeadFlag),
  };
}
