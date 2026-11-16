import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, getTableColumns, inArray, sql } from 'drizzle-orm';
import { type Db, integrations, rawPayloads, syncRuns, workspaces } from '@lidomer/db';
import type { IntegrationStatus, IntegrationType } from '@lidomer/shared';
import { DB } from '../db/db.module';
import type { SyncState } from '../sources/types';

export type IntegrationRow = typeof integrations.$inferSelect;

/** Подключения и журнал запусков. Все запросы ограничены workspace_id. */
@Injectable()
export class IntegrationsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  list(workspaceId: string): Promise<IntegrationRow[]> {
    return this.db.select().from(integrations).where(eq(integrations.workspaceId, workspaceId));
  }

  async get(workspaceId: string, type: IntegrationType): Promise<IntegrationRow | null> {
    const [row] = await this.db
      .select()
      .from(integrations)
      .where(and(eq(integrations.workspaceId, workspaceId), eq(integrations.type, type)))
      .limit(1);
    return row ?? null;
  }

  async getById(id: string): Promise<IntegrationRow | null> {
    const [row] = await this.db.select().from(integrations).where(eq(integrations.id, id)).limit(1);
    return row ?? null;
  }

  /** Подключения, которые синхронизируются по расписанию. */
  listActive(): Promise<(IntegrationRow & { timezone: string })[]> {
    return this.db
      .select({ ...getTableColumns(integrations), timezone: workspaces.timezone })
      .from(integrations)
      .innerJoin(workspaces, eq(workspaces.id, integrations.workspaceId))
      .where(inArray(integrations.status, ['connected', 'syncing', 'error']));
  }

  async timezoneOf(workspaceId: string): Promise<string> {
    const [row] = await this.db
      .select({ tz: workspaces.timezone })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId));
    return row?.tz ?? 'Asia/Bishkek';
  }

  async save(input: {
    workspaceId: string;
    type: IntegrationType;
    name: string;
    secretsEncrypted: string;
    settings: Record<string, unknown>;
  }): Promise<IntegrationRow> {
    const [row] = await this.db
      .insert(integrations)
      .values({ ...input, status: 'connected', lastError: null, syncState: {} })
      .onConflictDoUpdate({
        target: [integrations.workspaceId, integrations.type],
        set: {
          name: input.name,
          secretsEncrypted: input.secretsEncrypted,
          settings: input.settings,
          status: 'connected',
          lastError: null,
          syncState: {},
        },
      })
      .returning();
    return row!;
  }

  async setStatus(
    id: string,
    status: IntegrationStatus,
    lastError: string | null = null,
  ): Promise<void> {
    await this.db.update(integrations).set({ status, lastError }).where(eq(integrations.id, id));
  }

  async markSynced(id: string): Promise<void> {
    await this.db
      .update(integrations)
      .set({ lastSyncAt: new Date(), lastError: null, status: 'connected' })
      .where(
        and(
          eq(integrations.id, id),
          inArray(integrations.status, ['connected', 'syncing', 'error']),
        ),
      );
  }

  async setSyncState(id: string, state: SyncState): Promise<void> {
    await this.db.update(integrations).set({ syncState: state }).where(eq(integrations.id, id));
  }

  /** Отключить: секреты стираются, история данных остаётся. */
  async disconnect(id: string): Promise<void> {
    await this.db
      .update(integrations)
      .set({ status: 'disabled', secretsEncrypted: null, syncState: {} })
      .where(eq(integrations.id, id));
  }

  async startRun(input: {
    workspaceId: string;
    integrationId: string;
    source: IntegrationType;
    job: string;
    periodFrom?: string | null;
    periodTo?: string | null;
  }): Promise<number> {
    const [row] = await this.db.insert(syncRuns).values(input).returning({ id: syncRuns.id });
    return row!.id;
  }

  async finishRun(id: number, result: { records: number } | { error: string }): Promise<void> {
    await this.db
      .update(syncRuns)
      .set(
        'error' in result
          ? { status: 'error', error: result.error, finishedAt: new Date() }
          : { status: 'success', records: result.records, finishedAt: new Date() },
      )
      .where(eq(syncRuns.id, id));
  }

  listRuns(integrationId: string, limit = 50) {
    return this.db
      .select()
      .from(syncRuns)
      .where(eq(syncRuns.integrationId, integrationId))
      .orderBy(desc(syncRuns.startedAt))
      .limit(limit);
  }

  async recordRaw(entry: typeof rawPayloads.$inferInsert): Promise<void> {
    await this.db.insert(rawPayloads).values(entry);
  }

  /** Задачи в очереди по подключению — для статуса «синхронизация». */
  async pendingJobs(integrationId: string): Promise<number> {
    const rows = await this.db.execute<{ n: number }>(
      sql`select count(*)::int as n from pgmq.q_sync where message->>'integrationId' = ${integrationId}`,
    );
    return rows[0]?.n ?? 0;
  }
}
