import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { LEAD_CHANNELS } from '@lidomer/shared';
import { createdAt } from './columns';
import { workspaces } from './core';
import { dealStatusEnum } from './sources';

/*
 * Слой 3 — сверенный журнал лидов и метрики. Всегда пересчитываемы из таблиц источников
 * и ручных правок; сами источники сверка не меняет.
 */

const workspaceId = () =>
  uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' });

export const leadChannelEnum = pgEnum('lead_channel', LEAD_CHANNELS);

/** Единый журнал: лид Ward (с его сделкой) или сделка Bitrix24 без лида Ward. */
export const leads = pgTable(
  'leads',
  {
    workspaceId: workspaceId(),
    /** `ward:<id>` или `b24:<id>`. */
    id: text('id').notNull(),
    origin: text('origin').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    /** День обращения в поясе компании. */
    day: date('day').notNull(),
    name: text('name'),
    phone: text('phone'),
    instagram: text('instagram'),
    channel: leadChannelEnum('channel').notNull(),
    /** Ключ объявления: id Meta (из Ward) или «кампания › группа › объявление» из UTM. */
    adKey: text('ad_key'),
    adId: text('ad_id'),
    adName: text('ad_name'),
    campaignName: text('campaign_name'),
    adsetName: text('adset_name'),
    postId: text('post_id'),
    wardLeadId: integer('ward_lead_id'),
    dealId: text('deal_id'),
    dealSourceId: text('deal_source_id'),
    status: dealStatusEnum('status').notNull(),
    amountMinor: bigint('amount_minor', { mode: 'number' }),
    currency: text('currency'),
    isRepeat: boolean('is_repeat').notNull().default(false),
    repeatOf: text('repeat_of'),
    flags: text('flags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** Применённые ручные правки (id из lead_overrides). */
    overrides: jsonb('overrides'),
    builtAt: timestamp('built_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.id] }),
    index('leads_day_idx').on(t.workspaceId, t.day),
    index('leads_ad_idx').on(t.workspaceId, t.adKey),
  ],
).enableRLS();

/** Ручные решения по лиду: что поменяли, кто, когда, почему. Источники не трогают. */
export const leadOverrides = pgTable(
  'lead_overrides',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    workspaceId: workspaceId(),
    leadId: text('lead_id').notNull(),
    /** channel | status | excluded */
    field: text('field').notNull(),
    value: jsonb('value').notNull(),
    reason: text('reason').notNull(),
    authorId: uuid('author_id'),
    /** Отменённая правка остаётся в истории. */
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('lead_overrides_lead_idx').on(t.workspaceId, t.leadId)],
).enableRLS();

/** Агрегаты по дню × каналу × объявлению. Пересчитываются из leads и meta_insights_daily. */
export const metricsDaily = pgTable(
  'metrics_daily',
  {
    workspaceId: workspaceId(),
    day: date('day').notNull(),
    channel: leadChannelEnum('channel').notNull(),
    /** '' — без объявления. */
    adKey: text('ad_key').notNull().default(''),
    leads: integer('leads').notNull().default(0),
    repeats: integer('repeats').notNull().default(0),
    withPhone: integer('with_phone').notNull().default(0),
    sales: integer('sales').notNull().default(0),
    salesAmountMinor: bigint('sales_amount_minor', { mode: 'number' }).notNull().default(0),
    /** Расход Meta; null — нет данных (Meta не подключена или не ответила). */
    spendMinor: bigint('spend_minor', { mode: 'number' }),
    spendCurrency: text('spend_currency'),
    /** Лиды по данным Meta (из actions); null — нет данных. */
    metaLeads: integer('meta_leads'),
    builtAt: timestamp('built_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.day, t.channel, t.adKey] })],
).enableRLS();

/** Курс валюты к сому по дням (справочная таблица, без workspace_id). */
export const fxRates = pgTable(
  'fx_rates',
  {
    currency: text('currency').notNull(),
    day: date('day').notNull(),
    /** Сомов за 1 единицу валюты. */
    rate: numeric('rate', { precision: 14, scale: 6 }).notNull(),
    source: text('source').notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.currency, t.day] })],
).enableRLS();
