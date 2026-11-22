import {
  b24Contacts,
  b24Deals,
  type Db,
  leads,
  metaInsightsDaily,
  metricsDaily,
  wardLeads,
} from '@lidomer/db';
import { and, eq, gte, inArray, lt, or, type SQL, sql } from 'drizzle-orm';
import type { InsightIn, MetricLead, MetricRow } from './build-metrics';
import type { RepeatFlag, ReconcileStore, StoredLead } from './incremental';
import type { ContactIn, DealIn, LeadRow, WardLeadIn } from './reconcile';

const BATCH = 1000;

/** База или транзакция. */
export type Executor = Pick<Db, 'select' | 'insert' | 'delete' | 'execute'>;

/** Только колонки, которые нужны сверке: без `facts`, `request`, `title` и прочего. */
export const wardColumns = {
  id: wardLeads.id,
  createdAt: wardLeads.createdAt,
  name: wardLeads.name,
  phone: wardLeads.phone,
  instagram: wardLeads.instagram,
  status: wardLeads.status,
  sourceKind: wardLeads.sourceKind,
  sourceAdId: wardLeads.sourceAdId,
  adTitle: wardLeads.adTitle,
  sourcePostId: wardLeads.sourcePostId,
  crmEntity: wardLeads.crmEntity,
  crmId: wardLeads.crmId,
};

export const dealColumns = {
  id: b24Deals.id,
  createdAt: b24Deals.createdAt,
  stageId: b24Deals.stageId,
  amountMinor: b24Deals.amountMinor,
  currency: b24Deals.currency,
  sourceId: b24Deals.sourceId,
  sourceDescription: b24Deals.sourceDescription,
  utmSource: b24Deals.utmSource,
  utmMedium: b24Deals.utmMedium,
  utmCampaign: b24Deals.utmCampaign,
  utmContent: b24Deals.utmContent,
  contactId: b24Deals.contactId,
  phone: b24Deals.phone,
  clientName: b24Deals.clientName,
};

export const contactColumns = {
  id: b24Contacts.id,
  name: b24Contacts.name,
  phone: b24Contacts.phone,
};

export const insightColumns = {
  adId: metaInsightsDaily.adId,
  day: metaInsightsDaily.day,
  spendMinor: metaInsightsDaily.spendMinor,
  currency: metaInsightsDaily.currency,
  actions: metaInsightsDaily.actions,
};

export const toInsight = (i: {
  adId: string;
  day: string;
  spendMinor: number;
  currency: string;
  actions: unknown;
}): InsightIn => ({ ...i, actions: i.actions as InsightIn['actions'] });

const storedColumns = {
  id: leads.id,
  createdAt: leads.createdAt,
  day: leads.day,
  phone: leads.phone,
  instagram: leads.instagram,
  isRepeat: leads.isRepeat,
  repeatOf: leads.repeatOf,
  dealId: leads.dealId,
};

/** Журнал и источники одной компании для частичной пересборки (решение 0013). */
export class DbReconcileStore implements ReconcileStore {
  constructor(
    private readonly db: Executor,
    private readonly workspaceId: string,
  ) {}

  async wardLeads(ids: number[]): Promise<WardLeadIn[]> {
    if (!ids.length) return [];
    return this.db
      .select(wardColumns)
      .from(wardLeads)
      .where(and(eq(wardLeads.workspaceId, this.workspaceId), inArray(wardLeads.id, ids)));
  }

  async wardLeadsOfDeals(dealIds: string[]): Promise<WardLeadIn[]> {
    if (!dealIds.length) return [];
    return this.db
      .select(wardColumns)
      .from(wardLeads)
      .where(
        and(
          eq(wardLeads.workspaceId, this.workspaceId),
          eq(wardLeads.crmEntity, 'deal'),
          inArray(wardLeads.crmId, dealIds),
        ),
      );
  }

  async deals(ids: string[]): Promise<DealIn[]> {
    if (!ids.length) return [];
    return this.db
      .select(dealColumns)
      .from(b24Deals)
      .where(and(eq(b24Deals.workspaceId, this.workspaceId), inArray(b24Deals.id, ids)));
  }

  async contacts(ids: string[]): Promise<Map<string, ContactIn>> {
    if (!ids.length) return new Map();
    const rows = await this.db
      .select(contactColumns)
      .from(b24Contacts)
      .where(and(eq(b24Contacts.workspaceId, this.workspaceId), inArray(b24Contacts.id, ids)));
    return new Map(rows.map((c) => [c.id, c]));
  }

  async insights(days: string[]): Promise<InsightIn[]> {
    if (!days.length) return [];
    const rows = await this.db
      .select(insightColumns)
      .from(metaInsightsDaily)
      .where(
        and(
          eq(metaInsightsDaily.workspaceId, this.workspaceId),
          inArray(metaInsightsDaily.day, days),
        ),
      );
    return rows.map(toInsight);
  }

  private stored(where: SQL | undefined): Promise<StoredLead[]> {
    return this.db
      .select(storedColumns)
      .from(leads)
      .where(and(eq(leads.workspaceId, this.workspaceId), where));
  }

  async leadsByIds(ids: string[]): Promise<StoredLead[]> {
    return ids.length ? this.stored(inArray(leads.id, ids)) : [];
  }

  leadsFrom(at: Date): Promise<StoredLead[]> {
    return this.stored(gte(leads.createdAt, at));
  }

  async leadsWithKeys(before: Date, phones: string[], instagrams: string[]) {
    const keys = [
      phones.length ? inArray(leads.phone, phones) : undefined,
      instagrams.length ? inArray(leads.instagram, instagrams) : undefined,
    ].filter((k): k is SQL => !!k);
    return keys.length ? this.stored(and(lt(leads.createdAt, before), or(...keys))) : [];
  }

  async leadsOnDays(days: string[]): Promise<MetricLead[]> {
    if (!days.length) return [];
    return this.db
      .select({
        day: leads.day,
        channel: leads.channel,
        adKey: leads.adKey,
        isRepeat: leads.isRepeat,
        phone: leads.phone,
        status: leads.status,
        amountMinor: leads.amountMinor,
      })
      .from(leads)
      .where(and(eq(leads.workspaceId, this.workspaceId), inArray(leads.day, days)));
  }

  async writeLeads(change: { remove: string[]; insert: LeadRow[]; flags: RepeatFlag[] }) {
    const ws = this.workspaceId;
    for (let i = 0; i < change.remove.length; i += BATCH) {
      await this.db
        .delete(leads)
        .where(
          and(eq(leads.workspaceId, ws), inArray(leads.id, change.remove.slice(i, i + BATCH))),
        );
    }
    for (let i = 0; i < change.insert.length; i += BATCH) {
      await this.db
        .insert(leads)
        .values(change.insert.slice(i, i + BATCH).map((r) => ({ ...r, workspaceId: ws })));
    }
    // Пометки повторов — одним запросом на порцию.
    for (let i = 0; i < change.flags.length; i += BATCH) {
      const values = sql.join(
        change.flags
          .slice(i, i + BATCH)
          .map((f) => sql`(${f.id}::text, ${f.isRepeat}::boolean, ${f.repeatOf}::text)`),
        sql`, `,
      );
      await this.db.execute(sql`
        update ${leads} set is_repeat = v.is_repeat, repeat_of = v.repeat_of, built_at = now()
        from (values ${values}) as v(id, is_repeat, repeat_of)
        where ${leads.workspaceId} = ${ws} and ${leads.id} = v.id`);
    }
  }

  async writeMetrics(days: string[], rows: MetricRow[]) {
    const ws = this.workspaceId;
    await this.db
      .delete(metricsDaily)
      .where(and(eq(metricsDaily.workspaceId, ws), inArray(metricsDaily.day, days)));
    for (let i = 0; i < rows.length; i += BATCH) {
      await this.db
        .insert(metricsDaily)
        .values(rows.slice(i, i + BATCH).map((m) => ({ ...m, workspaceId: ws })));
    }
  }
}
