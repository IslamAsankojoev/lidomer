import { timestamp } from 'drizzle-orm/pg-core';

/** Общие колонки времени. Файл не реэкспортируется из схемы — drizzle-kit видит только таблицы. */
export const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
