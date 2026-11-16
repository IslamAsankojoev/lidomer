import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type Db = ReturnType<typeof createDb>['db'];

/**
 * Подключение к Postgres. Для Supabase transaction pooler (порт 6543) prepared statements
 * не поддерживаются — `prepare: false`.
 */
export function createDb(url: string, options: { max?: number } = {}) {
  const client = postgres(url, { prepare: false, max: options.max ?? 5 });
  return { db: drizzle(client, { schema, casing: 'snake_case' }), client };
}
