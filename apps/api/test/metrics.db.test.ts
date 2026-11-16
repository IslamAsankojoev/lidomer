/**
 * «Из чего сложилось» на настоящих данных dev-базы: для каждой цифры сводки
 * список лидов возвращает ровно столько записей. Только чтение.
 * Запуск: RUN_DB_TESTS=1 pnpm --filter @lidomer/api test
 */
import { createDb } from '@lidomer/db';
import { LEAD_METRICS } from '@lidomer/shared';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { MetricsRepository } from '../src/reconciliation/metrics.repository';

const enabled = process.env.RUN_DB_TESTS === '1';
if (enabled) process.loadEnvFile(resolve(__dirname, '../../../.env.local'));

describe.runIf(enabled)('из чего сложилось — на данных', { timeout: 120_000 }, () => {
  const { db, client } = enabled ? createDb(process.env.DATABASE_URL!, { max: 2 }) : ({} as never);
  const repo = new MetricsRepository(db);
  afterAll(() => client?.end());

  const periods = [
    ['2026-11-09', '2026-11-16'],
    ['2026-11-16', '2026-11-16'],
    ['2026-09-01', '2026-11-17'],
  ] as const;

  it.each(periods)('%s — %s: каждая цифра = число её лидов', async (from, to) => {
    const [ws] = await client`select id from workspaces where name = 'lidforce'`;
    if (!ws) return;
    const counts = await repo.counts(ws.id, from, to, false);
    for (const metric of LEAD_METRICS) {
      const { total } = await repo.listLeads(ws.id, { from, to, metric, limit: 1, offset: 0 });
      expect({ metric, total }).toEqual({ metric, total: counts[metric] });
    }
    expect(counts.spendMinor).toBeNull();

    // Итоги «Креативов» = лиды с рекламы и расход на «Обзоре».
    const creatives = await repo.creatives(ws.id, from, to, false);
    expect(creatives.reduce((a, c) => a + c.leads, 0)).toBe(counts.adLeads);
    expect(creatives.every((c) => c.spendMinor === null)).toBe(true);
  });
});
