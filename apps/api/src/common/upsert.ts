import { getTableColumns, sql, type SQL } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';

/** `set` для upsert: все колонки, кроме ключевых, берутся из новой строки (`excluded`). */
export function excludedSet<T extends PgTable>(table: T, keep: string[]): Record<string, SQL> {
  const set: Record<string, SQL> = {};
  for (const [key, col] of Object.entries(getTableColumns(table))) {
    if (keep.includes(key)) continue;
    set[key] = sql.raw(`excluded."${col.name}"`);
  }
  return set;
}

/**
 * Upsert, который не трогает строку, если данные не изменились: `ON CONFLICT … DO UPDATE SET … WHERE
 * (колонки) IS DISTINCT FROM (новые значения)`. Колонки служебного времени (`ignore`) не сравниваются,
 * поэтому `synced_at` остаётся временем последнего изменения — по нему сверка ищет изменения (решение 0013).
 */
export function onlyChanged<T extends PgTable>(
  table: T,
  set: Record<string, SQL | Date>,
  ignore: string[] = ['syncedAt'],
): { set: Record<string, SQL | Date>; setWhere: SQL } {
  const columns = getTableColumns(table);
  const keys = Object.keys(set).filter((k) => !ignore.includes(k));
  const current = sql.join(
    keys.map((k) => sql`${columns[k]}`),
    sql`, `,
  );
  const next = sql.join(
    keys.map((k) => sql`${set[k]}`),
    sql`, `,
  );
  return { set, setWhere: sql`(${current}) is distinct from (${next})` };
}
