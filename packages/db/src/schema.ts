import { sql } from 'drizzle-orm';
import {
  bigserial,
  index,
  jsonb,
  pgEnum,
  pgSchema,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { ROLES } from '@lidomer/shared';

/*
 * Правила схемы:
 * - во всех таблицах, кроме справочных, есть workspace_id;
 * - RLS включён везде и политик нет: браузер не читает таблицы напрямую, данные отдаёт только api
 *   (api подключается ролью postgres, на которую RLS не действует);
 * - время — timestamptz (UTC).
 */

/** Пользователи Supabase Auth. Таблицей управляет Supabase — не экспортируем, чтобы drizzle-kit её не трогал. */
const authUsers = pgSchema('auth').table('users', { id: uuid('id').primaryKey() });

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const roleEnum = pgEnum('member_role', ROLES);

export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  logoPath: text('logo_path'),
  timezone: text('timezone').notNull().default('Asia/Bishkek'),
  displayCurrency: text('display_currency').notNull().default('USD'),
  settings: jsonb('settings').notNull().default(sql`'{}'::jsonb`),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}).enableRLS();

export const members = pgTable(
  'members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    role: roleEnum('role').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('members_workspace_user_uq').on(t.workspaceId, t.userId),
    index('members_user_idx').on(t.userId),
  ],
).enableRLS();

export const INTEGRATION_TYPES = ['meta_ads', 'ward', 'bitrix24', 'telegram'] as const;
export const integrationTypeEnum = pgEnum('integration_type', INTEGRATION_TYPES);

export const INTEGRATION_STATUSES = [
  'not_connected',
  'connected',
  'syncing',
  'error',
  'reauth_required',
  'disabled',
] as const;
export const integrationStatusEnum = pgEnum('integration_status', INTEGRATION_STATUSES);

export const integrations = pgTable(
  'integrations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    type: integrationTypeEnum('type').notNull(),
    name: text('name').notNull(),
    status: integrationStatusEnum('status').notNull().default('not_connected'),
    /** Секреты, зашифрованные AES-256-GCM (base64: iv.tag.ciphertext). Никогда не отдаются наружу. */
    secretsEncrypted: text('secrets_encrypted'),
    settings: jsonb('settings').notNull().default(sql`'{}'::jsonb`),
    lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('integrations_workspace_idx').on(t.workspaceId, t.type)],
).enableRLS();

/** Журнал действий и ручных правок. Только добавление. */
export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    actorUserId: uuid('actor_user_id').references(() => authUsers.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    before: jsonb('before'),
    after: jsonb('after'),
    reason: text('reason'),
    createdAt: createdAt(),
  },
  (t) => [index('audit_log_workspace_created_idx').on(t.workspaceId, t.createdAt)],
).enableRLS();

export type Workspace = typeof workspaces.$inferSelect;
export type Member = typeof members.$inferSelect;
export type Integration = typeof integrations.$inferSelect;
export type AuditLogEntry = typeof auditLog.$inferInsert;
