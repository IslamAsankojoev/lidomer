/**
 * Проверка очереди и выполнения задач на настоящей базе (dev-проект Supabase).
 * Запуск: RUN_DB_TESTS=1 pnpm --filter @lidomer/api test — нужен .env.local. В CI пропускается.
 * Создаёт временную компанию и удаляет её в конце (каскадом уходят её данные).
 */
import { createDb, integrations, rawPayloads, syncRuns, workspaces } from '@lidomer/db';
import { eq, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HttpError } from '../src/common/http';
import { SecretBox } from '../src/common/secret-box';
import { IntegrationsRepository } from '../src/integrations/integrations.repository';
import { JobRunner } from '../src/jobs/job-runner';
import { JobQueue } from '../src/jobs/queue';
import type { SourceAdapter } from '../src/sources/types';

const enabled = process.env.RUN_DB_TESTS === '1';
if (enabled) process.loadEnvFile(resolve(__dirname, '../../../.env.local'));

describe.runIf(enabled)('очередь задач на базе', { timeout: 60_000 }, () => {
  const { db, client } = enabled ? createDb(process.env.DATABASE_URL!, { max: 2 }) : ({} as never);
  const box = new SecretBox(randomBytes(32).toString('base64'));
  let workspaceId = '';
  let integrationId = '';
  const ran: string[] = [];

  // Фейковый источник: «день 3» падает с ошибкой доступа, остальные пишут raw и считают записи.
  const fake: SourceAdapter<{ apiKey: string }> = {
    type: 'ward',
    secretsSchema: undefined as never,
    mask: () => ({}),
    test: async () => ({ details: {}, warnings: [] }),
    initialJobs: () => [],
    dueJobs: (state) => ({ jobs: [], state }),
    async run(job, secrets, ctx) {
      expect(secrets.apiKey).toBe('wdr_test_secret');
      const day = String(job.params.day);
      if (day === '2026-11-03') throw new HttpError(401, 'WARD: ключ неверный');
      ran.push(day);
      await ctx.recordRaw({
        endpoint: '/leads',
        request: { day },
        httpStatus: 200,
        response: { data: [1, 2] },
      });
      return { records: 2 };
    },
  };

  const repo = new IntegrationsRepository(db);
  const queue = new JobQueue(db);
  const rebuilt: string[] = [];
  const reconciliation = { rebuild: async (ws: string) => void rebuilt.push(ws) } as never;
  const fx = { ensureToday: async () => {} } as never;
  const reports = { schedule: async () => [] } as never;
  const alerts: unknown[] = [];
  const telegram = { integrationAlert: async (...a: unknown[]) => void alerts.push(a) } as never;
  const runner = new JobRunner(
    db,
    queue,
    repo,
    { ward: fake as SourceAdapter<unknown> },
    box,
    reconciliation,
    fx,
    reports,
    telegram,
    { beat: async () => {} } as never,
  );

  beforeAll(async () => {
    const [ws] = await db
      .insert(workspaces)
      .values({ name: `test-queue-${Date.now()}` })
      .returning();
    workspaceId = ws!.id;
    const [row] = await db
      .insert(integrations)
      .values({
        workspaceId,
        type: 'ward',
        name: 'WARD',
        status: 'connected',
        secretsEncrypted: box.seal({ apiKey: 'wdr_test_secret' }),
      })
      .returning();
    integrationId = row!.id;
    // Чистим очередь от сообщений других запусков этого теста не нужно — задачи чужих компаний не трогаем:
    // runner возьмёт их тоже, поэтому проверяем только свои записи.
  });

  afterAll(async () => {
    if (workspaceId) {
      await db.execute(
        sql`delete from pgmq.q_sync where message->>'integrationId' = ${integrationId}`,
      );
      await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    }
    await client?.end();
  });

  it('берёт задачи из очереди, пишет sync_runs и raw_payloads, ошибку доступа — в статус', async () => {
    await queue.send(
      ['2026-11-01', '2026-11-02', '2026-11-03'].map((day) => ({
        workspaceId,
        integrationId,
        kind: 'ward:day',
        params: { day },
      })),
    );
    expect(await repo.pendingJobs(integrationId)).toBe(3);

    await runner.tick(40_000);

    expect(ran.sort()).toEqual(['2026-11-01', '2026-11-02']);
    // Данные загружены — журнал компании пересобран один раз.
    expect(rebuilt).toEqual([workspaceId]);
    const runs = await db.select().from(syncRuns).where(eq(syncRuns.integrationId, integrationId));
    expect(runs.filter((r) => r.status === 'success').map((r) => r.records)).toEqual([2, 2]);
    expect(runs.find((r) => r.status === 'error')?.error).toContain('ключ неверный');
    const raw = await db
      .select()
      .from(rawPayloads)
      .where(eq(rawPayloads.integrationId, integrationId));
    expect(raw).toHaveLength(2);
    const [row] = await db.select().from(integrations).where(eq(integrations.id, integrationId));
    expect(row!.status).toBe('reauth_required');
    // Переход в «Нужно переподключить» — один алерт.
    expect(alerts).toHaveLength(1);
    // Ошибка доступа не повторяется — задача в архиве, в очереди пусто.
    expect(await repo.pendingJobs(integrationId)).toBe(0);
  });

  it('блокировка: второй захват того же ключа не проходит, после снятия — проходит', async () => {
    const key = `test:${integrationId}`;
    expect(await queue.lock(workspaceId, key, 60)).toBe(true);
    expect(await queue.lock(workspaceId, key, 60)).toBe(false);
    await queue.unlock(key);
    expect(await queue.lock(workspaceId, key, 60)).toBe(true);
    await queue.unlock(key);
  });
});
