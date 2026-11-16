import { b24Deals, b24Stages } from '@lidomer/db';
import { currencyDigits } from '@lidomer/shared';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { excludedSet } from '../../common/upsert';
import { isDue, type JobSpec, type SourceAdapter } from '../types';
import { B24Client, type B24ClientOptions, b24WebhookUrlSchema } from './b24.client';

export const b24SecretsSchema = z.object({ webhookUrl: b24WebhookUrlSchema });
export type B24Secrets = z.infer<typeof b24SecretsSchema>;

const HOUR = 3_600_000;
const DEAL_FIELDS = [
  'ID',
  'TITLE',
  'CATEGORY_ID',
  'STAGE_ID',
  'OPPORTUNITY',
  'CURRENCY_ID',
  'SOURCE_ID',
  'SOURCE_DESCRIPTION',
  'UTM_SOURCE',
  'UTM_MEDIUM',
  'UTM_CAMPAIGN',
  'UTM_CONTENT',
  'UTM_TERM',
  'ASSIGNED_BY_ID',
  'DATE_CREATE',
  'DATE_MODIFY',
  'CLOSEDATE',
] as const;

const s = z.string().nullish();
const dealSchema = z.looseObject({
  ID: z.union([z.string(), z.number()]),
  TITLE: s,
  CATEGORY_ID: z.union([z.string(), z.number()]).nullish(),
  STAGE_ID: s,
  OPPORTUNITY: z.union([z.string(), z.number()]).nullish(),
  CURRENCY_ID: s,
  SOURCE_ID: s,
  SOURCE_DESCRIPTION: s,
  UTM_SOURCE: s,
  UTM_MEDIUM: s,
  UTM_CAMPAIGN: s,
  UTM_CONTENT: s,
  UTM_TERM: s,
  ASSIGNED_BY_ID: z.union([z.string(), z.number()]).nullish(),
  DATE_CREATE: s,
  DATE_MODIFY: s,
  CLOSEDATE: s,
});
export type B24Deal = z.infer<typeof dealSchema>;

const listResponse = <T extends z.ZodType>(item: T) =>
  z.looseObject({
    result: z.array(item),
    next: z.number().optional(),
    total: z.number().optional(),
  });

const statusSchema = z.looseObject({
  STATUS_ID: z.string(),
  NAME: z.string(),
  SORT: z.union([z.string(), z.number()]).nullish(),
  ENTITY_ID: z.string(),
  CATEGORY_ID: z.union([z.string(), z.number()]).nullish(),
  SEMANTICS: s,
  EXTRA: z.looseObject({ SEMANTICS: s }).nullish(),
});

/** Направление: DEAL_STAGE — общее (0), DEAL_STAGE_5 — направление 5. */
function stageCategory(st: { ENTITY_ID: string; CATEGORY_ID?: unknown }): number {
  if (st.CATEGORY_ID !== null && st.CATEGORY_ID !== undefined && st.CATEGORY_ID !== '')
    return Number(st.CATEGORY_ID);
  const m = /^DEAL_STAGE_(\d+)$/.exec(st.ENTITY_ID);
  return m ? Number(m[1]) : 0;
}

const text = (v: unknown) => (v === null || v === undefined || v === '' ? null : String(v));
const date = (v: string | null | undefined) => (v ? new Date(v) : null);

/** «15000.50» в валюте → целые минимальные единицы. Пустая сумма — null, а не ноль. */
export function toMinor(amount: unknown, currency: string | null | undefined): number | null {
  if (amount === null || amount === undefined || amount === '' || !currency) return null;
  const n = Number(amount);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 10 ** currencyDigits(currency));
}

export function mapDeal(workspaceId: string, d: B24Deal) {
  return {
    workspaceId,
    id: String(d.ID),
    title: text(d.TITLE),
    categoryId:
      d.CATEGORY_ID === null || d.CATEGORY_ID === undefined ? null : Number(d.CATEGORY_ID),
    stageId: text(d.STAGE_ID),
    amountMinor: toMinor(d.OPPORTUNITY, d.CURRENCY_ID),
    currency: text(d.CURRENCY_ID),
    sourceId: text(d.SOURCE_ID),
    sourceDescription: text(d.SOURCE_DESCRIPTION),
    utmSource: text(d.UTM_SOURCE),
    utmMedium: text(d.UTM_MEDIUM),
    utmCampaign: text(d.UTM_CAMPAIGN),
    utmContent: text(d.UTM_CONTENT),
    utmTerm: text(d.UTM_TERM),
    assignedById: text(d.ASSIGNED_BY_ID),
    createdAt: date(d.DATE_CREATE),
    updatedAt: date(d.DATE_MODIFY),
    closedAt: date(d.CLOSEDATE),
  };
}

/**
 * Bitrix24 через входящий вебхук. Список сделок — crm.deal.list (v2) постранично по ID
 * (`start=-1` без подсчёта total — быстрее). REST 3.0 — после сверки полей на портале (решение 0004).
 */
export function createB24Adapter(clientOpts: B24ClientOptions = {}): SourceAdapter<B24Secrets> {
  const client = (secrets: B24Secrets, onResponse?: B24ClientOptions['onResponse']) =>
    new B24Client(secrets.webhookUrl, { ...clientOpts, onResponse });

  const full: JobSpec[] = [
    { kind: 'b24:stages', params: {} },
    { kind: 'b24:deals', params: { afterId: '0' } },
  ];

  return {
    type: 'bitrix24',
    secretsSchema: b24SecretsSchema,
    mask: (sec) => {
      const u = new URL(sec.webhookUrl);
      const [, , user, code] = u.pathname.split('/');
      return { webhookUrl: `https://${u.host}/rest/${user}/${(code ?? '').slice(0, 2)}…/` };
    },

    async test(secrets, recordRaw) {
      const api = client(secrets, recordRaw);
      const res = listResponse(dealSchema).parse(
        await api.call('crm.deal.list', { select: ['ID'], order: { ID: 'DESC' }, start: 0 }),
      );
      return {
        details: { Портал: api.portal, 'Сделок всего': String(res.total ?? res.result.length) },
        warnings: [],
      };
    },

    initialJobs: () => full,

    // Раз в час — изменённые сделки (с запасом 1 час), ночью — полная выгрузка и стадии.
    dueJobs(state, now) {
      const next = { ...state };
      if (isDue(state, 'b24:nightly', now, 24 * HOUR)) {
        next['b24:nightly'] = next['b24:hourly'] = now.toISOString();
        return { jobs: full, state: next };
      }
      if (isDue(state, 'b24:hourly', now, HOUR)) {
        const since = new Date(
          Date.parse(state['b24:hourly'] ?? now.toISOString()) - HOUR,
        ).toISOString();
        next['b24:hourly'] = now.toISOString();
        return { jobs: [{ kind: 'b24:deals', params: { afterId: '0', since } }], state: next };
      }
      return { jobs: [], state: next };
    },

    async run(job, secrets, ctx) {
      const api = client(secrets, ctx.recordRaw);

      if (job.kind === 'b24:stages') {
        const statuses = listResponse(statusSchema).parse(
          await api.call('crm.status.list', {
            filter: { '%ENTITY_ID': 'DEAL_STAGE' },
            order: { SORT: 'ASC' },
          }),
        ).result;
        if (statuses.length) {
          await ctx.db
            .insert(b24Stages)
            .values(
              statuses.map((st) => ({
                workspaceId: ctx.workspaceId,
                stageId: st.STATUS_ID,
                categoryId: stageCategory(st),
                name: st.NAME,
                semantics: text(st.SEMANTICS ?? st.EXTRA?.SEMANTICS),
                sort: st.SORT === null || st.SORT === undefined ? null : Number(st.SORT),
              })),
            )
            // Сопоставление владельца (mapped_status) не трогаем.
            .onConflictDoUpdate({
              target: [b24Stages.workspaceId, b24Stages.stageId],
              set: {
                categoryId: sql`excluded.category_id`,
                name: sql`excluded.name`,
                semantics: sql`excluded.semantics`,
                sort: sql`excluded.sort`,
                updatedAt: new Date(),
              },
            });
        }
        return { records: statuses.length };
      }

      if (job.kind === 'b24:deals') {
        const params = z
          .object({ afterId: z.string(), since: z.string().optional() })
          .parse(job.params);
        let afterId = params.afterId;
        let records = 0;
        for (;;) {
          const filter: Record<string, unknown> = { '>ID': afterId };
          if (params.since) filter['>=DATE_MODIFY'] = params.since;
          const page = listResponse(dealSchema).parse(
            await api.call('crm.deal.list', {
              select: DEAL_FIELDS,
              filter,
              order: { ID: 'ASC' },
              start: -1,
            }),
          ).result;
          if (page.length) {
            await ctx.db
              .insert(b24Deals)
              .values(page.map((d) => mapDeal(ctx.workspaceId, d)))
              .onConflictDoUpdate({
                target: [b24Deals.workspaceId, b24Deals.id],
                set: excludedSet(b24Deals, ['workspaceId', 'id']),
              });
            records += page.length;
            afterId = String(page[page.length - 1]!.ID);
          }
          if (page.length < 50) return { records };
          // Не успеваем — продолжим следующей задачей с того же места.
          if (Date.now() > ctx.deadline - 20_000)
            return { records, continueWith: { ...params, afterId } };
        }
      }

      throw new Error(`Bitrix24: неизвестная задача ${job.kind}`);
    },
  };
}
