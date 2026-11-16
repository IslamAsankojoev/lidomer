import { Inject, Injectable } from '@nestjs/common';
import { eq, lt, sql } from 'drizzle-orm';
import { type Db, jobLocks } from '@lidomer/db';
import { z } from 'zod';
import { DB } from '../db/db.module';

const QUEUE = 'sync';

export const jobMessageSchema = z.object({
  workspaceId: z.uuid(),
  /** Нет у задач отчётов. */
  integrationId: z.uuid().optional(),
  kind: z.string(),
  params: z.record(z.string(), z.unknown()),
});
export type JobMessage = z.infer<typeof jobMessageSchema>;

export interface QueuedJob {
  msgId: number;
  readCount: number;
  message: unknown;
}

/** Очередь задач в Postgres (Supabase Queues / pgmq) и блокировки задач по ключу. */
@Injectable()
export class JobQueue {
  constructor(@Inject(DB) private readonly db: Db) {}

  async send(messages: JobMessage[]): Promise<void> {
    if (!messages.length) return;
    await this.db.execute(
      sql`select pgmq.send_batch(${QUEUE}, array(select jsonb_array_elements(${JSON.stringify(messages)}::jsonb)))`,
    );
  }

  /** Взять одну задачу; пока она в работе, её не видят другие вызовы (`vtSeconds`). */
  async readOne(vtSeconds: number): Promise<QueuedJob | null> {
    const rows = await this.db.execute<{ msg_id: string; read_ct: number; message: unknown }>(
      sql`select msg_id, read_ct, message from pgmq.read(${QUEUE}, ${vtSeconds}, 1)`,
    );
    const r = rows[0];
    return r ? { msgId: Number(r.msg_id), readCount: r.read_ct, message: r.message } : null;
  }

  async delete(msgId: number): Promise<void> {
    await this.db.execute(sql`select pgmq.delete(${QUEUE}, ${msgId}::bigint)`);
  }

  /** Убрать в архив — задача больше не повторяется, но остаётся для разбора. */
  async archive(msgId: number): Promise<void> {
    await this.db.execute(sql`select pgmq.archive(${QUEUE}, ${msgId}::bigint)`);
  }

  /** Вернуть задачу в очередь через `seconds`. */
  async retryIn(msgId: number, seconds: number): Promise<void> {
    await this.db.execute(sql`select pgmq.set_vt(${QUEUE}, ${msgId}::bigint, ${seconds})`);
  }

  /** Захватить ключ задачи на `seconds`. false — такая же задача уже идёт. */
  async lock(workspaceId: string, key: string, seconds: number): Promise<boolean> {
    const until = new Date(Date.now() + seconds * 1000);
    const rows = await this.db
      .insert(jobLocks)
      .values({ workspaceId, key, lockedUntil: until })
      .onConflictDoUpdate({
        target: jobLocks.key,
        set: { lockedUntil: until, workspaceId },
        setWhere: lt(jobLocks.lockedUntil, new Date()),
      })
      .returning({ key: jobLocks.key });
    return rows.length > 0;
  }

  async unlock(key: string): Promise<void> {
    await this.db.delete(jobLocks).where(eq(jobLocks.key, key));
  }
}
