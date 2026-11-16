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
import { DEAL_STATUSES, SYNC_RUN_STATUSES } from '@lidomer/shared';
import { createdAt, updatedAt } from './columns';
import { integrations, integrationTypeEnum, workspaces } from './core';

/*
 * Слой 1 — сырые ответы (raw_payloads), слой 2 — таблицы источников.
 * Таблицы источников обновляются upsert'ом по id источника: повторная синхронизация не создаёт дублей.
 * Время — как прислал источник, в UTC. Деньги — целые минимальные единицы + код валюты.
 */

const workspaceId = () =>
  uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' });

const syncedAt = () =>
  timestamp('synced_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// ---------- Журналы ----------

export const syncRunStatusEnum = pgEnum('sync_run_status', SYNC_RUN_STATUSES);

/** Каждый запуск синхронизации: источник, задача, период, итог. */
export const syncRuns = pgTable(
  'sync_runs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    workspaceId: workspaceId(),
    integrationId: uuid('integration_id')
      .notNull()
      .references(() => integrations.id, { onDelete: 'cascade' }),
    source: integrationTypeEnum('source').notNull(),
    /** Имя задачи, например `ward:leads`. */
    job: text('job').notNull(),
    periodFrom: date('period_from'),
    periodTo: date('period_to'),
    status: syncRunStatusEnum('status').notNull().default('running'),
    records: integer('records').notNull().default(0),
    error: text('error'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [index('sync_runs_integration_started_idx').on(t.integrationId, t.startedAt)],
).enableRLS();

/**
 * Ответ внешнего API как есть. Только добавление, никогда не меняется:
 * доказательство и основа для пересчёта. Секреты в `request` не пишутся.
 */
export const rawPayloads = pgTable(
  'raw_payloads',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    workspaceId: workspaceId(),
    integrationId: uuid('integration_id')
      .notNull()
      .references(() => integrations.id, { onDelete: 'cascade' }),
    syncRunId: bigint('sync_run_id', { mode: 'number' }).references(() => syncRuns.id, {
      onDelete: 'set null',
    }),
    source: integrationTypeEnum('source').notNull(),
    endpoint: text('endpoint').notNull(),
    request: jsonb('request').notNull(),
    httpStatus: integer('http_status').notNull(),
    response: jsonb('response'),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('raw_payloads_run_idx').on(t.syncRunId)],
).enableRLS();

// ---------- Meta Ads ----------

export const metaAdAccounts = pgTable(
  'meta_ad_accounts',
  {
    workspaceId: workspaceId(),
    /** `act_…` */
    id: text('id').notNull(),
    name: text('name').notNull(),
    currency: text('currency').notNull(),
    timezoneName: text('timezone_name').notNull(),
    /** account_status Meta: 1 — активен. */
    status: integer('status').notNull(),
    /** Выбран ли аккаунт для синхронизации. */
    enabled: boolean('enabled').notNull().default(true),
    syncedAt: syncedAt(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.id] })],
).enableRLS();

export const metaCampaigns = pgTable(
  'meta_campaigns',
  {
    workspaceId: workspaceId(),
    id: text('id').notNull(),
    accountId: text('account_id').notNull(),
    name: text('name').notNull(),
    objective: text('objective'),
    status: text('status'),
    effectiveStatus: text('effective_status'),
    syncedAt: syncedAt(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.id] })],
).enableRLS();

export const metaAdsets = pgTable(
  'meta_adsets',
  {
    workspaceId: workspaceId(),
    id: text('id').notNull(),
    accountId: text('account_id').notNull(),
    campaignId: text('campaign_id').notNull(),
    name: text('name').notNull(),
    status: text('status'),
    optimizationGoal: text('optimization_goal'),
    destinationType: text('destination_type'),
    syncedAt: syncedAt(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.id] })],
).enableRLS();

export const metaAds = pgTable(
  'meta_ads',
  {
    workspaceId: workspaceId(),
    id: text('id').notNull(),
    accountId: text('account_id').notNull(),
    campaignId: text('campaign_id').notNull(),
    adsetId: text('adset_id').notNull(),
    name: text('name').notNull(),
    status: text('status'),
    effectiveStatus: text('effective_status'),
    creativeId: text('creative_id'),
    /** Путь к копии превью в Supabase Storage (ссылки Meta временные). */
    previewPath: text('preview_path'),
    createdTime: timestamp('created_time', { withTimezone: true }),
    syncedAt: syncedAt(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.id] })],
).enableRLS();

/** Объявление × день (день — в поясе рекламного аккаунта, как считает Meta). */
export const metaInsightsDaily = pgTable(
  'meta_insights_daily',
  {
    workspaceId: workspaceId(),
    adId: text('ad_id').notNull(),
    day: date('day').notNull(),
    accountId: text('account_id').notNull(),
    campaignId: text('campaign_id').notNull(),
    adsetId: text('adset_id').notNull(),
    currency: text('currency').notNull(),
    spendMinor: bigint('spend_minor', { mode: 'number' }).notNull(),
    impressions: bigint('impressions', { mode: 'number' }).notNull(),
    clicks: bigint('clicks', { mode: 'number' }).notNull(),
    /** `actions` целиком — метрику лида можно сменить без перезагрузки. */
    actions: jsonb('actions')
      .notNull()
      .default(sql`'[]'::jsonb`),
    syncedAt: syncedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.adId, t.day] }),
    index('meta_insights_daily_day_idx').on(t.workspaceId, t.day),
  ],
).enableRLS();

// ---------- Ward ----------

export const wardConversations = pgTable(
  'ward_conversations',
  {
    workspaceId: workspaceId(),
    id: integer('id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    lastClientMessageAt: timestamp('last_client_message_at', { withTimezone: true }),
    lastReplyAt: timestamp('last_reply_at', { withTimezone: true }),
    /** comment | direct | request */
    channel: text('channel').notNull(),
    /** bot | manager | paused */
    handledBy: text('handled_by'),
    needsManager: text('needs_manager'),
    hasLead: boolean('has_lead').notNull(),
    instagram: text('instagram'),
    adId: text('ad_id'),
    postId: text('post_id'),
    messagesIn: integer('messages_in'),
    messagesOut: integer('messages_out'),
    facts: jsonb('facts'),
    syncedAt: syncedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.id] }),
    index('ward_conversations_created_idx').on(t.workspaceId, t.createdAt),
  ],
).enableRLS();

export const WARD_SOURCE_KINDS = ['ad', 'post', 'direct', 'unknown'] as const;
export const wardSourceKindEnum = pgEnum('ward_source_kind', WARD_SOURCE_KINDS);

/** Лиды Ward. Содержат персональные данные (имя, телефон) — не логировать. */
export const wardLeads = pgTable(
  'ward_leads',
  {
    workspaceId: workspaceId(),
    id: integer('id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
    name: text('name'),
    phone: text('phone'),
    instagram: text('instagram'),
    request: text('request'),
    /** Текст источника как есть. */
    sourceText: text('source_text'),
    /** new | in_work | won | lost */
    status: text('status'),
    /** Сумма продажи из Ward; валюту Ward не сообщает — справочно. */
    amount: numeric('amount'),
    crmSystem: text('crm_system'),
    crmEntity: text('crm_entity'),
    crmId: text('crm_id'),
    adId: text('ad_id'),
    adTitle: text('ad_title'),
    postId: text('post_id'),
    facts: jsonb('facts'),
    /** Разбор источника: поле `ad` главное, иначе текст `source`. */
    sourceKind: wardSourceKindEnum('source_kind').notNull(),
    sourceAdId: text('source_ad_id'),
    sourcePostId: text('source_post_id'),
    syncedAt: syncedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.id] }),
    index('ward_leads_created_idx').on(t.workspaceId, t.createdAt),
    index('ward_leads_crm_idx').on(t.workspaceId, t.crmId),
  ],
).enableRLS();

// ---------- Bitrix24 ----------

export const dealStatusEnum = pgEnum('deal_status', DEAL_STATUSES);

/** Стадии сделок и их сопоставление со статусами «в работе / продажа / отказ» (b24_stage_map из ТЗ). */
export const b24Stages = pgTable(
  'b24_stages',
  {
    workspaceId: workspaceId(),
    stageId: text('stage_id').notNull(),
    categoryId: integer('category_id').notNull(),
    name: text('name').notNull(),
    /** Семантика Bitrix24: P — в работе, S — успех, F — провал. */
    semantics: text('semantics'),
    sort: integer('sort'),
    /** Сопоставление владельца; пока null — по семантике. */
    mappedStatus: dealStatusEnum('mapped_status'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.stageId] })],
).enableRLS();

export const b24Deals = pgTable(
  'b24_deals',
  {
    workspaceId: workspaceId(),
    id: text('id').notNull(),
    title: text('title'),
    categoryId: integer('category_id'),
    stageId: text('stage_id'),
    amountMinor: bigint('amount_minor', { mode: 'number' }),
    currency: text('currency'),
    sourceId: text('source_id'),
    sourceDescription: text('source_description'),
    utmSource: text('utm_source'),
    utmMedium: text('utm_medium'),
    utmCampaign: text('utm_campaign'),
    utmContent: text('utm_content'),
    utmTerm: text('utm_term'),
    assignedById: text('assigned_by_id'),
    createdAt: timestamp('created_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    syncedAt: syncedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.id] }),
    index('b24_deals_updated_idx').on(t.workspaceId, t.updatedAt),
  ],
).enableRLS();

// ---------- Задачи ----------

/**
 * Блокировка задачи по ключу (`ward:day:<integration>:2026-11-16`): два запуска одной задачи
 * не идут одновременно. Работает через пул транзакций Supabase, в отличие от advisory-locks.
 */
export const jobLocks = pgTable(
  'job_locks',
  {
    workspaceId: workspaceId(),
    key: text('key').notNull(),
    lockedUntil: timestamp('locked_until', { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.key] })],
).enableRLS();
