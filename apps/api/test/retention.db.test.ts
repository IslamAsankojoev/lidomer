/**
 * Очистка служебных таблиц: что удаляется, а что остаётся.
 * Запуск: RUN_DB_TESTS=1 pnpm --filter @lidomer/api test — нужен .env.local (DATABASE_URL можно
 * переопределить на локальную базу с миграциями). В CI пропускается.
 * Создаёт временную компанию и чистит только её (`purge(..., workspaceId)`), в конце удаляет её.
 */
import { b24Deals, createDb, integrations, rawPayloads, syncRuns, workspaces } from '@lidomer/db';
import { eq } from 'drizzle-orm';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MetricsRepository } from '../src/reconciliation/metrics.repository';
import { Retention } from '../src/jobs/retention';

const enabled = process.env.RUN_DB_TESTS === '1';
if (enabled) process.loadEnvFile(resolve(__dirname, '../../../.env.local'));

const NOW = new Date('2026-12-01T00:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);
const statuses = (name: string) => ({
  result: [{ ENTITY_ID: 'SOURCE', STATUS_ID: 'WEB', NAME: name }],
});

describe.runIf(enabled)('очистка служебных таблиц', { timeout: 60_000 }, () => {
  const { db, client } = enabled ? createDb(process.env.DATABASE_URL!, { max: 2 }) : ({} as never);
  const retention = new Retention(db);
  let workspaceId = '';
  let b24 = '';
  let ward = '';

  beforeAll(async () => {
    const [ws] = await db
      .insert(workspaces)
      .values({ name: `test-retention-${Date.now()}` })
      .returning();
    workspaceId = ws!.id;
    const rows = await db
      .insert(integrations)
      .values([
        { workspaceId, type: 'bitrix24', name: 'B24', status: 'connected' },
        { workspaceId, type: 'ward', name: 'WARD', status: 'connected' },
      ])
      .returning();
    b24 = rows.find((r) => r.type === 'bitrix24')!.id;
    ward = rows.find((r) => r.type === 'ward')!.id;
  });

  afterAll(async () => {
    if (workspaceId) await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await client?.end();
  });

  it('удаляет старое, оставляет молодое и последний crm.status.list', async () => {
    const [oldRun, newRun] = await db
      .insert(syncRuns)
      .values([
        {
          workspaceId,
          integrationId: b24,
          source: 'bitrix24',
          job: 'b24:x',
          startedAt: daysAgo(31),
        },
        {
          workspaceId,
          integrationId: b24,
          source: 'bitrix24',
          job: 'b24:x',
          startedAt: daysAgo(29),
        },
      ])
      .returning({ id: syncRuns.id });
    const raw = (
      integrationId: string,
      endpoint: string,
      age: number,
      response: object = {},
      syncRunId?: number,
    ) => ({
      workspaceId,
      integrationId,
      syncRunId,
      source: integrationId === b24 ? ('bitrix24' as const) : ('ward' as const),
      endpoint,
      request: {},
      httpStatus: 200,
      response,
      fetchedAt: daysAgo(age),
    });
    await db.insert(rawPayloads).values([
      raw(ward, '/conversations', 20),
      raw(ward, '/conversations', 15),
      raw(ward, '/conversations', 13),
      raw(b24, 'crm.deal.list', 20),
      raw(b24, 'crm.status.list', 40, statuses('старое')),
      // Последний crm.status.list старше срока — его читает «Источники», остаётся (с oldRun).
      raw(b24, 'crm.status.list', 30, statuses('Сайт'), oldRun!.id),
    ]);

    const report = await retention.purge(NOW, Date.now() + 30_000, workspaceId);

    expect(report).toMatchObject({ rawPayloads: 4, syncRuns: 1, cronRuns: 0, finished: true });
    const left = await db
      .select({
        endpoint: rawPayloads.endpoint,
        at: rawPayloads.fetchedAt,
        run: rawPayloads.syncRunId,
      })
      .from(rawPayloads)
      .where(eq(rawPayloads.workspaceId, workspaceId));
    expect(left.map((r) => r.endpoint).sort()).toEqual(['/conversations', 'crm.status.list']);
    expect(left.find((r) => r.endpoint === 'crm.status.list')).toMatchObject({
      at: daysAgo(30),
      run: null, // запуск старше 30 дней удалён — ссылка обнулилась
    });
    const runs = await db
      .select({ id: syncRuns.id })
      .from(syncRuns)
      .where(eq(syncRuns.workspaceId, workspaceId));
    expect(runs.map((r) => r.id)).toEqual([newRun!.id]);
    // «Источники» Bitrix24 по-прежнему берут названия из сохранённого ответа.
    await db
      .insert(b24Deals)
      .values({ workspaceId, id: '1', sourceId: 'WEB', createdAt: new Date() });
    const sources = await new MetricsRepository(db).bitrixSources(workspaceId);
    expect(sources.map((s) => s.name)).toEqual(['Сайт']);

    // Появился свежий crm.status.list — прежний последний уходит при следующей очистке.
    await db.insert(rawPayloads).values(raw(b24, 'crm.status.list', 1, statuses('Сайт 2')));
    const again = await retention.purge(NOW, Date.now() + 30_000, workspaceId);
    expect(again.rawPayloads).toBe(1);
  });
});
