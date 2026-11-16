import { Inject, Injectable } from '@nestjs/common';
import {
  b24Deals,
  b24Stages,
  type Db,
  leads,
  wardConversations,
  wardLeads,
  workspaces,
} from '@lidomer/db';
import {
  type AsksResponse,
  dayRangeUtc,
  type FunnelResponse,
  type HeatmapResponse,
  LEAD_CHANNEL_LABELS,
  type LeadChannel,
} from '@lidomer/shared';
import { and, between, eq, gte, lt, sql } from 'drizzle-orm';
import { DB } from '../db/db.module';

/** «1 или 2», «1-2», «1–2» → «1–2»; «2» → «2»; остальное — как есть (обрезанное). */
export function normalizeRooms(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const v = String(raw).trim().toLowerCase();
  if (!v) return null;
  const nums = v.match(/\d+/g);
  if (nums && nums.length >= 2 && /или|-|–|,|\//.test(v))
    return `${nums[0]}–${nums[nums.length - 1]}`;
  if (nums && nums.length === 1 && v.replace(/\D/g, '') === nums[0]) return nums[0];
  if (/студ/.test(v)) return 'студия';
  return v.length > 24 ? `${v.slice(0, 24)}…` : v;
}

@Injectable()
export class InsightsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  private async tz(workspaceId: string): Promise<string> {
    const [ws] = await this.db
      .select({ tz: workspaces.timezone })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId));
    return ws?.tz ?? 'Asia/Bishkek';
  }

  /** «Когда пишут»: новые лиды по дню недели и часу в поясе компании. */
  async heatmap(
    workspaceId: string,
    from: string,
    to: string,
    channel?: LeadChannel,
  ): Promise<HeatmapResponse> {
    const tz = await this.tz(workspaceId);
    const local = sql`(${leads.createdAt} at time zone ${tz})`;
    const rows = await this.db
      .select({
        dow: sql<number>`(extract(isodow from ${local})::int - 1)`,
        hour: sql<number>`extract(hour from ${local})::int`,
        n: sql<number>`count(*)::int`,
      })
      .from(leads)
      .where(
        and(
          eq(leads.workspaceId, workspaceId),
          between(leads.day, from, to),
          eq(leads.isRepeat, false),
          channel ? eq(leads.channel, channel) : undefined,
        ),
      )
      .groupBy(sql`1`, sql`2`);
    const cells = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
    let total = 0;
    for (const r of rows) {
      cells[r.dow]![r.hour] = r.n;
      total += r.n;
    }
    return { cells, total };
  }

  /** «Что спрашивают»: комнаты и ЖК из анкеты Ward по лидам периода. */
  async asks(workspaceId: string, from: string, to: string): Promise<AsksResponse> {
    const rows = await this.db
      .select({ facts: wardLeads.facts })
      .from(leads)
      .innerJoin(
        wardLeads,
        and(eq(wardLeads.workspaceId, leads.workspaceId), eq(wardLeads.id, leads.wardLeadId)),
      )
      .where(and(eq(leads.workspaceId, workspaceId), between(leads.day, from, to)));
    const rooms = new Map<string, number>();
    const complexes = new Map<string, number>();
    let withFacts = 0;
    for (const { facts } of rows) {
      const f = (facts ?? {}) as Record<string, unknown>;
      if (Object.keys(f).length) withFacts++;
      const r = normalizeRooms(f.rooms);
      if (r) rooms.set(r, (rooms.get(r) ?? 0) + 1);
      const c = typeof f.complex === 'string' ? f.complex.trim() : '';
      if (c && c.length <= 40) complexes.set(c, (complexes.get(c) ?? 0) + 1);
    }
    const top = (m: Map<string, number>, n: number) =>
      [...m.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([label, count]) => ({ label, count }));
    return {
      wardLeads: rows.length,
      withFacts,
      rooms: top(rooms, 6),
      complexes: top(complexes, 5),
    };
  }

  /** Воронка Ward → Bitrix24: переписки → лиды → с телефоном → сделка → в работе → продажа. */
  async funnel(workspaceId: string, from: string, to: string): Promise<FunnelResponse> {
    const tz = await this.tz(workspaceId);
    const { start, end } = dayRangeUtc(from, to, tz);
    const [conv] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(wardConversations)
      .where(
        and(
          eq(wardConversations.workspaceId, workspaceId),
          gte(wardConversations.createdAt, start),
          lt(wardConversations.createdAt, end),
        ),
      );
    const [l] = await this.db
      .select({
        all: sql<number>`count(*)::int`,
        phone: sql<number>`count(${leads.phone})::int`,
        deal: sql<number>`count(${leads.dealId})::int`,
        inWork: sql<number>`count(*) filter (where ${leads.dealId} is not null and ${leads.status} = 'in_work')::int`,
        won: sql<number>`count(*) filter (where ${leads.status} = 'won')::int`,
      })
      .from(leads)
      .where(
        and(
          eq(leads.workspaceId, workspaceId),
          eq(leads.origin, 'ward'),
          between(leads.day, from, to),
        ),
      );
    return {
      conversations: conv?.n ?? 0,
      wardLeads: l?.all ?? 0,
      withPhone: l?.phone ?? 0,
      withDeal: l?.deal ?? 0,
      inWork: l?.inWork ?? 0,
      sales: l?.won ?? 0,
    };
  }

  /** Данные для хронологии лида: лид Ward (источник, анкета) и сделка (даты, стадия). */
  async leadSources(workspaceId: string, wardLeadId: number | null, dealId: string | null) {
    const [ward] = wardLeadId
      ? await this.db
          .select({
            createdAt: wardLeads.createdAt,
            sourceText: wardLeads.sourceText,
            facts: wardLeads.facts,
            status: wardLeads.status,
            adTitle: wardLeads.adTitle,
          })
          .from(wardLeads)
          .where(and(eq(wardLeads.workspaceId, workspaceId), eq(wardLeads.id, wardLeadId)))
      : [];
    const [deal] = dealId
      ? await this.db
          .select({
            title: b24Deals.title,
            createdAt: b24Deals.createdAt,
            updatedAt: b24Deals.updatedAt,
            closedAt: b24Deals.closedAt,
            stageName: b24Stages.name,
            semantics: b24Stages.semantics,
            utmSource: b24Deals.utmSource,
          })
          .from(b24Deals)
          .leftJoin(
            b24Stages,
            and(
              eq(b24Stages.workspaceId, b24Deals.workspaceId),
              eq(b24Stages.stageId, b24Deals.stageId),
            ),
          )
          .where(and(eq(b24Deals.workspaceId, workspaceId), eq(b24Deals.id, dealId)))
      : [];
    return { ward: ward ?? null, deal: deal ?? null };
  }
}

export const channelLabel = (c: LeadChannel) => LEAD_CHANNEL_LABELS[c];
