/**
 * Сколько миграций в `migrations/` (записей в `meta/_journal.json`). Сторож api сверяет это число
 * с `drizzle.__drizzle_migrations`: база отстала — алерт (код выложен, а `pnpm db:migrate` забыли).
 * После `pnpm db:generate` число поднять — тест в api (`schema-check.test.ts`) сверяет его с журналом.
 */
export const MIGRATIONS_COUNT = 17;
