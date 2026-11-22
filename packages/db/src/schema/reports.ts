import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { DELIVERY_CHANNELS } from '@lidomer/shared';
import { createdAt, updatedAt } from './columns';
import { workspaces } from './core';

const workspaceId = () =>
  uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' });

/** Группы и личные чаты, куда добавлен бот. Без компании — пока группу не привязали кодом. */
export const telegramChats = pgTable(
  'telegram_chats',
  {
    /** id чата Telegram (может быть отрицательным и больше int32). */
    id: text('id').primaryKey(),
    workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    type: text('type').notNull(),
    isForum: boolean('is_forum').notNull().default(false),
    /** Темы форума, из которых приходила команда: [{ id, name }]. */
    topics: jsonb('topics')
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** Бот в чате и может писать. */
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('telegram_chats_workspace_idx').on(t.workspaceId)],
).enableRLS();

/** Отчёт: шаблон + блоки + период + расписание. Получатели — в report_recipients. */
export const reports = pgTable(
  'reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: workspaceId(),
    name: text('name').notNull(),
    template: text('template').notNull(),
    /** Какие блоки на картинке и в подписи, фильтры, период. */
    config: jsonb('config').notNull(),
    /** Время (в поясе компании), дни недели и числа месяца. */
    schedule: jsonb('schedule').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    createdBy: uuid('created_by'),
    /** Кто последним сохранил отчёт (создал или поменял) — «Маркетолог» внизу отчёта. */
    updatedBy: uuid('updated_by'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('reports_workspace_idx').on(t.workspaceId)],
).enableRLS();

export const deliveryChannelEnum = pgEnum('delivery_channel', DELIVERY_CHANNELS);

/**
 * Получатели отчёта: канал и чат. Внешнего ключа на telegram_chats нет — группы WhatsApp живут в
 * integrations.settings; принадлежность чата компании проверяет сервис при сохранении.
 */
export const reportRecipients = pgTable(
  'report_recipients',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    workspaceId: workspaceId(),
    reportId: uuid('report_id')
      .notNull()
      .references(() => reports.id, { onDelete: 'cascade' }),
    channel: deliveryChannelEnum('channel').notNull().default('telegram'),
    /** id чата Telegram или группы WhatsApp (`…@g.us`). */
    chatId: text('chat_id').notNull(),
    /** Тема форума Telegram; null — общий чат. */
    threadId: text('thread_id'),
  },
  (t) => [uniqueIndex('report_recipients_uq').on(t.reportId, t.channel, t.chatId, t.threadId)],
).enableRLS();

export const REPORT_RUN_STATUSES = [
  'pending',
  'waiting_data',
  'sent',
  'partial',
  'failed',
] as const;
export const reportRunStatusEnum = pgEnum('report_run_status', REPORT_RUN_STATUSES);

/** Запуск отчёта: слот расписания, снимок цифр, картинка, доставка. */
export const reportRuns = pgTable(
  'report_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: workspaceId(),
    reportId: uuid('report_id')
      .notNull()
      .references(() => reports.id, { onDelete: 'cascade' }),
    /** Время слота (UTC). Тестовая отправка — время нажатия. */
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }).notNull(),
    isTest: boolean('is_test').notNull().default(false),
    status: reportRunStatusEnum('status').notNull().default('pending'),
    /** Цифры, по которым нарисована картинка и подпись. */
    snapshot: jsonb('snapshot'),
    imagePath: text('image_path'),
    /** PDF рядом с PNG в бакете reports — только у отчётов в формате PDF. */
    pdfPath: text('pdf_path'),
    caption: text('caption'),
    /** «данные Ward на 09:05» — если отправили, не дождавшись свежих данных. */
    dataNote: text('data_note'),
    deliveries: jsonb('deliveries')
      .notNull()
      .default(sql`'[]'::jsonb`),
    error: text('error'),
    createdAt: createdAt(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
  },
  (t) => [
    // Один слот расписания — один запуск (тестовые не ограничены).
    uniqueIndex('report_runs_slot_uq')
      .on(t.reportId, t.scheduledFor)
      .where(sql`not ${t.isTest}`),
    index('report_runs_report_idx').on(t.reportId, t.createdAt),
  ],
).enableRLS();
