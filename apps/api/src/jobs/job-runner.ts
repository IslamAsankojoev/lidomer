import { Inject, Injectable, Logger } from '@nestjs/common';
import { isDayKey } from '@lidomer/shared';
import { HttpError } from '../common/http';
import { SecretBox } from '../common/secret-box';
import { DB } from '../db/db.module';
import type { Db } from '@lidomer/db';
import { describeError, SECRET_BOX } from '../integrations/integrations.service';
import { IntegrationsRepository } from '../integrations/integrations.repository';
import { type AdapterRegistry, SOURCE_ADAPTERS } from '../sources/registry';
import { FxService } from '../reconciliation/fx.service';
import { ReconciliationService } from '../reconciliation/reconciliation.service';
import { JobQueue, jobMessageSchema } from './queue';

/** Сколько раз повторять задачу, прежде чем убрать её в архив. */
const MAX_ATTEMPTS = 5;
/** Сколько секунд задача невидима для других вызовов, пока выполняется. */
const VISIBILITY_SECONDS = 120;

/** Период для журнала — только если это дата YYYY-MM-DD. */
const dayParam = (v: unknown): string | null => (typeof v === 'string' && isDayKey(v) ? v : null);

export interface TickReport {
  scheduled: number;
  processed: number;
  failed: number;
  /** Компаний, у которых пересобран журнал лидов и метрики. */
  rebuilt: number;
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
    @Inject(ReconciliationService) private readonly reconciliation: ReconciliationService,
    @Inject(FxService) private readonly fx: FxService,
  ) {}

  async tick(budgetMs: number, now = new Date()): Promise<TickReport> {
    const deadline = Date.now() + budgetMs;
    const report: TickReport = {
      scheduled: await this.schedule(now),
      processed: 0,
      failed: 0,
      rebuilt: 0,
    };
    await this.fx.ensureToday();
    const touched = new Set<string>();
    // Оставляем запас: задача и пересборка должны успеть до лимита функции.
    while (Date.now() < deadline - 25_000) {
      const job = await this.queue.readOne(VISIBILITY_SECONDS);
      if (!job) break;
      const ws = await this.process(job.msgId, job.readCount, job.message, deadline);
      if (ws) {
        report.processed++;
        if (ws !== true) touched.add(ws);
      } else report.failed++;
    }
    // Данные изменились — пересобираем журнал лидов и метрики этих компаний.
    for (const ws of touched) {
      try {
        await this.reconciliation.rebuild(ws);
        report.rebuilt++;
      } catch (err) {
        this.log.error(
          `Сверка ${ws} не удалась: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
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

  /** true — обработано без изменения данных, id компании — данные загружены, false — ошибка. */
  private async process(
    msgId: number,
    readCount: number,
    raw: unknown,
    deadline: number,
  ): Promise<string | boolean> {
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
      periodFrom: dayParam(params.day) ?? dayParam(params.from),
      periodTo: dayParam(params.day) ?? dayParam(params.to),
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
      return row.workspaceId;
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
