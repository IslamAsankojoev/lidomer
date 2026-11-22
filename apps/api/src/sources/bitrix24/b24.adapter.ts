import { b24Contacts, b24Deals, b24Stages } from '@lidomer/db';
import { currencyDigits, normalizePhone, normalizeStageSemantics } from '@lidomer/shared';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { excludedSet, onlyChanged } from '../../common/upsert';
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
  'CONTACT_ID',
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
  CONTACT_ID: z.union([z.string(), z.number()]).nullish(),
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
const DEAL_STAGE_ENTITY = /^DEAL_STAGE(?:_(\d+))?$/;

/**
 * Стадии сделок из ответа crm.status.list. Портал может вернуть все справочники CRM
 * (источники, типы, счета…) — берём только DEAL_STAGE и DEAL_STAGE_<направление>.
 * Направление — из ENTITY_ID: DEAL_STAGE — общее (0), DEAL_STAGE_5 — направление 5.
 */
export function pickDealStages<T extends { ENTITY_ID: string; STATUS_ID: string }>(
  items: T[],
): (T & { categoryId: number })[] {
  const seen = new Set<string>();
  const out: (T & { categoryId: number })[] = [];
  for (const it of items) {
    const m = DEAL_STAGE_ENTITY.exec(it.ENTITY_ID);
    if (!m || seen.has(it.STATUS_ID)) continue;
    seen.add(it.STATUS_ID);
    out.push({ ...it, categoryId: m[1] ? Number(m[1]) : 0 });
  }
  return out;
}

const contactSchema = z.looseObject({
  ID: z.union([z.string(), z.number()]),
  NAME: s,
  LAST_NAME: s,
  PHONE: z.array(z.looseObject({ VALUE: z.string().nullish() })).nullish(),
});

/** Контакты сделок страницы: имя и первый телефон. Персональные данные — только в базу. */
async function syncContacts(
  api: B24Client,
  ctx: { db: import('@lidomer/db').Db; workspaceId: string },
  deals: B24Deal[],
): Promise<number> {
  const ids = [
    ...new Set(deals.map((d) => text(d.CONTACT_ID)).filter((v): v is string => !!v && v !== '0')),
  ];
  if (!ids.length) return 0;
  const contacts = listResponse(contactSchema).parse(
    await api.call('crm.contact.list', {
      filter: { '@ID': ids },
      select: ['ID', 'NAME', 'LAST_NAME', 'PHONE'],
      start: -1,
    }),
  ).result;
  if (!contacts.length) return 0;
  await ctx.db
    .insert(b24Contacts)
    .values(
      contacts.map((c) => ({
        workspaceId: ctx.workspaceId,
        id: String(c.ID),
        name: [c.NAME, c.LAST_NAME].filter(Boolean).join(' ') || null,
        phone: (c.PHONE ?? []).map((p) => normalizePhone(p.VALUE)).find(Boolean) ?? null,
      })),
    )
    .onConflictDoUpdate({
      target: [b24Contacts.workspaceId, b24Contacts.id],
      ...onlyChanged(b24Contacts, excludedSet(b24Contacts, ['workspaceId', 'id'])),
    });
  return contacts.length;
}

const categoryListSchema = z.looseObject({
  result: z.looseObject({
    categories: z.array(z.looseObject({ id: z.union([z.number(), z.string()]), name: z.string() })),
  }),
});

/** Названия направлений сделок. Не получилось — не беда: экран покажет «Направление N». */
async function loadCategoryNames(api: B24Client): Promise<Map<number, string>> {
  try {
    const res = categoryListSchema.parse(await api.call('crm.category.list', { entityTypeId: 2 }));
    return new Map(res.result.categories.map((c) => [Number(c.id), c.name]));
  } catch {
    return new Map();
  }
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

/** Пользовательские поля сделки с телефоном и именем клиента (лид-формы без контакта). */
export interface FormFields {
  phone: string[];
  name: string[];
}
export const NO_FORM_FIELDS: FormFields = { phone: [], name: [] };

const fieldsSchema = z.looseObject({
  result: z.record(
    z.string(),
    z.looseObject({ type: z.string(), formLabel: s, listLabel: s, title: s }),
  ),
});

/**
 * Находит поля UF_* с подписью «телефон / номер / phone» и «имя / name». Номера полей у каждого
 * портала свои, поэтому — по подписям, а не по коду.
 */
export function detectFormFields(fields: z.infer<typeof fieldsSchema>['result']): FormFields {
  const out: FormFields = { phone: [], name: [] };
  for (const [code, f] of Object.entries(fields)) {
    if (!code.startsWith('UF_') || f.type !== 'string') continue;
    const label = `${f.formLabel ?? ''} ${f.listLabel ?? ''} ${f.title ?? ''}`.toLowerCase();
    if (/телефон|номер|phone/.test(label)) out.phone.push(code);
    else if (/(^|\s)(имя|name|фио)(\s|$)/.test(label)) out.name.push(code);
  }
  return out;
}

const firstValue = (d: Record<string, unknown>, codes: string[]) =>
  codes.map((c) => text(d[c])).find((v) => v !== null) ?? null;

export function mapDeal(workspaceId: string, d: B24Deal, form: FormFields = NO_FORM_FIELDS) {
  const raw = d as Record<string, unknown>;
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
    contactId: text(d.CONTACT_ID),
    phone: form.phone.map((c) => normalizePhone(text(raw[c]))).find(Boolean) ?? null,
    clientName: firstValue(raw, form.name),
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
          await api.call('crm.status.list', { order: { SORT: 'ASC' } }),
        ).result;
        const stages = pickDealStages(statuses);
        const categoryNames = await loadCategoryNames(api);
        if (stages.length) {
          await ctx.db
            .insert(b24Stages)
            .values(
              stages.map((st) => ({
                workspaceId: ctx.workspaceId,
                stageId: st.STATUS_ID,
                categoryId: st.categoryId,
                categoryName: categoryNames.get(st.categoryId) ?? null,
                name: st.NAME,
                semantics: normalizeStageSemantics(st.EXTRA?.SEMANTICS, st.SEMANTICS),
                sort: st.SORT === null || st.SORT === undefined ? null : Number(st.SORT),
              })),
            )
            // Сопоставление владельца (mapped_status) не трогаем.
            .onConflictDoUpdate({
              target: [b24Stages.workspaceId, b24Stages.stageId],
              // updated_at двигается только при изменении: по нему сверка видит смену стадий.
              ...onlyChanged(
                b24Stages,
                {
                  categoryId: sql`excluded.category_id`,
                  categoryName: sql`excluded.category_name`,
                  name: sql`excluded.name`,
                  semantics: sql`excluded.semantics`,
                  sort: sql`excluded.sort`,
                  updatedAt: new Date(),
                },
                ['updatedAt'],
              ),
            });
        }
        return { records: stages.length };
      }

      if (job.kind === 'b24:deals') {
        const params = z
          .object({ afterId: z.string(), since: z.string().optional() })
          .parse(job.params);
        let afterId = params.afterId;
        let records = 0;
        const form = detectFormFields(
          fieldsSchema.parse(await api.call('crm.deal.fields', {})).result,
        );
        const select = [...DEAL_FIELDS, ...form.phone, ...form.name];
        for (;;) {
          const filter: Record<string, unknown> = { '>ID': afterId };
          if (params.since) filter['>=DATE_MODIFY'] = params.since;
          const page = listResponse(dealSchema).parse(
            await api.call('crm.deal.list', {
              select,
              filter,
              order: { ID: 'ASC' },
              start: -1,
            }),
          ).result;
          if (page.length) {
            await ctx.db
              .insert(b24Deals)
              .values(page.map((d) => mapDeal(ctx.workspaceId, d, form)))
              .onConflictDoUpdate({
                target: [b24Deals.workspaceId, b24Deals.id],
                ...onlyChanged(b24Deals, excludedSet(b24Deals, ['workspaceId', 'id'])),
              });
            records += page.length;
            afterId = String(page[page.length - 1]!.ID);
            records += await syncContacts(api, ctx, page);
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
