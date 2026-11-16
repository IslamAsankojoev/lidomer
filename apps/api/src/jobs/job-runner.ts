import { Inject, Injectable, Logger } from '@nestjs/common';
import { HttpError } from '../common/http';
import { SecretBox } from '../common/secret-box';
import { DB } from '../db/db.module';
import type { Db } from '@lidomer/db';
import { describeError, SECRET_BOX } from '../integrations/integrations.service';
import { IntegrationsRepository } from '../integrations/integrations.repository';
import { type AdapterRegistry, SOURCE_ADAPTERS } from '../sources/registry';
import { JobQueue, jobMessageSchema } from './queue';

/** Сколько раз повторять задачу, прежде чем убрать её в архив. */
const MAX_ATTEMPTS = 5;
/** Сколько секунд задача невидима для других вызовов, пока выполняется. */
const VISIBILITY_SECONDS = 120;

export interface TickReport {
  scheduled: number;
  processed: number;
  failed: number;
}

/**
 * Один вызов `tick`: поставить плановые задачи и разобрать очередь, пока есть время.
 * Что не успело — остаётся в очереди до следующего вызова.
 */
@Injectable()
export class JobRunner {
  private readonly log = new Logger(JobRunner.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(JobQueue) private readonly queue: JobQueue,
    @Inject(IntegrationsRepository) private readonly repo: IntegrationsRepository,
    @Inject(SOURCE_ADAPTERS) private readonly adapters: AdapterRegistry,
    @Inject(SECRET_BOX) private readonly box: SecretBox,
  ) {}

  async tick(budgetMs: number, now = new Date()): Promise<TickReport> {
    const deadline = Date.now() + budgetMs;
    const report: TickReport = { scheduled: await this.schedule(now), processed: 0, failed: 0 };
    // Оставляем запас: задача должна успеть закончиться до лимита функции.
    while (Date.now() < deadline - 15_000) {
      const job = await this.queue.readOne(VISIBILITY_SECONDS);
      if (!job) break;
      const ok = await this.process(job.msgId, job.readCount, job.message, deadline);
      if (ok) report.processed++;
      else report.failed++;
    }
    return report;
  }

  /** Плановые задачи всех подключений, которым пришло время. */
  async schedule(now: Date): Promise<number> {
    let count = 0;
    for (const row of await this.repo.listActive()) {
      const adapter = this.adapters[row.type];
      if (!adapter) continue;
      const { jobs, state } = adapter.dueJobs(
        (row.syncState ?? {}) as Record<string, string>,
        now,
        row.timezone,
      );
      if (!jobs.length) continue;
      await this.queue.send(
        jobs.map((j) => ({
          workspaceId: row.workspaceId,
          integrationId: row.id,
          kind: j.kind,
          params: j.params,
        })),
      );
      await this.repo.setSyncState(row.id, state);
      count += jobs.length;
    }
    return count;
  }

  private async process(
    msgId: number,
    readCount: number,
    raw: unknown,
    deadline: number,
  ): Promise<boolean> {
    const parsed = jobMessageSchema.safeParse(raw);
    if (!parsed.success) {
      this.log.error(`Задача ${msgId} в неверном формате — в архив`);
      await this.queue.archive(msgId);
      return false;
    }
    const msg = parsed.data;
    const row = await this.repo.getById(msg.integrationId);
    const adapter = row ? this.adapters[row.type] : undefined;
    if (!row || !adapter || !row.secretsEncrypted || row.status === 'disabled') {
      await this.queue.delete(msgId); // подключение удалено или отключено
      return true;
    }

    const key = `${row.id}:${msg.kind}:${JSON.stringify(msg.params)}`;
    if (!(await this.queue.lock(row.workspaceId, key, VISIBILITY_SECONDS))) {
      await this.queue.retryIn(msgId, 30); // такая же задача уже идёт
      return true;
    }

    const params = msg.params;
    const runId = await this.repo.startRun({
      workspaceId: row.workspaceId,
      integrationId: row.id,
      source: row.type,
      job: msg.kind,
      periodFrom:
        typeof params.day === 'string' ? params.day : ((params.from as string | undefined) ?? null),
      periodTo:
        typeof params.day === 'string' ? params.day : ((params.to as string | undefined) ?? null),
    });
    try {
      const result = await adapter.run(
        { kind: msg.kind, params },
        this.box.open(row.secretsEncrypted),
        {
          db: this.db,
          workspaceId: row.workspaceId,
          integrationId: row.id,
          timezone: await this.repo.timezoneOf(row.workspaceId),
          now: new Date(),
          deadline,
          recordRaw: (e) =>
            this.repo.recordRaw({
              workspaceId: row.workspaceId,
              integrationId: row.id,
              syncRunId: runId,
              source: row.type,
              endpoint: e.endpoint,
              request: e.request,
              httpStatus: e.httpStatus,
              response: e.response as object,
            }),
        },
      );
      await this.repo.finishRun(runId, { records: result.records });
      if (result.continueWith) {
        await this.queue.send([{ ...msg, params: result.continueWith }]);
      }
      await this.queue.delete(msgId);
      await this.repo.markSynced(row.id);
      return true;
    } catch (err) {
      const message = describeError(err);
      await this.repo.finishRun(runId, { error: message });
      const auth = err instanceof HttpError && (err.status === 401 || err.status === 403);
      if (auth) {
        await this.repo.setStatus(row.id, 'reauth_required', message);
        await this.queue.archive(msgId);
      } else if (readCount >= MAX_ATTEMPTS) {
        await this.repo.setStatus(row.id, 'error', message);
        await this.queue.archive(msgId);
      } else {
        await this.repo.setStatus(row.id, 'error', message);
        await this.queue.retryIn(msgId, 60 * readCount);
      }
      this.log.warn(`Задача ${msg.kind} (${row.type}) не выполнена: ${message}`);
      return false;
    } finally {
      await this.queue.unlock(key);
    }
  }
}
