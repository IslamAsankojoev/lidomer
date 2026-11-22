import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Db, heartbeats, rawPayloads, syncRuns } from '@lidomer/db';
import { and, eq, inArray, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import { DB } from '../db/db.module';

/** Сколько дней хранить служебные записи. */
export const RETENTION_DAYS = { rawPayloads: 14, syncRuns: 30, cronRuns: 7 } as const;

/**
 * Ответы, которые код читает и после срока: последний по каждому подключению не удаляется.
 * `crm.status.list` — названия источников Bitrix24 (`MetricsRepository.bitrixSources`).
 */
export const RAW_KEEP_LATEST = ['crm.status.list'];

/** Строк за один DELETE: короткие транзакции без долгих блокировок. */
const BATCH = 5_000;
/** Раз в сутки; 23 часа — чтобы время запуска не уползало вперёд. */
const EVERY_MS = 23 * 3_600_000;
const KEY = 'retention';

const daysBefore = (now: Date, days: number) => new Date(now.getTime() - days * 86_400_000);

export interface RetentionReport {
  rawPayloads: number;
  syncRuns: number;
  cronRuns: number;
  /** false — не успели за бюджет, следующий `tick` продолжит. */
  finished: boolean;
}

/**
 * Очистка служебных таблиц раз в сутки внутри `tick` (решение 0012).
 * Пользовательские данные (лиды, сделки, отчёты) не трогает.
 */
@Injectable()
export class Retention {
  private readonly log = new Logger(Retention.name);

  constructor(@Inject(DB) private readonly db: Db) {}

  /** Запускает очистку, если сегодня её ещё не было. Ошибка не роняет `tick`. */
  async runDaily(now: Date, deadline: number): Promise<RetentionReport | null> {
    if (!(await this.claim(now))) return null;
    try {
      const report = await this.purge(now, deadline);
      if (!report.finished) await this.release();
      if (report.rawPayloads || report.syncRuns || report.cronRuns)
        this.log.log(
          `Очистка: raw_payloads ${report.rawPayloads}, sync_runs ${report.syncRuns}, ` +
            `cron.job_run_details ${report.cronRuns}${report.finished ? '' : ' (продолжим)'}`,
        );
      return report;
    } catch (err) {
      await this.release().catch(() => undefined);
      this.log.error(`Очистка не удалась: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  /**
   * Удаляет записи старше срока порциями, пока есть время.
   * `workspaceId` — только для тестов на общей базе: чистить лишь свою временную компанию.
   */
  async purge(now: Date, deadline: number, workspaceId?: string): Promise<RetentionReport> {
    const report: RetentionReport = { rawPayloads: 0, syncRuns: 0, cronRuns: 0, finished: false };
    const inTime = () => Date.now() < deadline;

    const rawCutoff = daysBefore(now, RETENTION_DAYS.rawPayloads);
    const newer = sql`select 1 from ${rawPayloads} n
      where n.integration_id = ${rawPayloads.integrationId}
        and n.endpoint = ${rawPayloads.endpoint}
        and (n.fetched_at, n.id) > (${rawPayloads.fetchedAt}, ${rawPayloads.id})`;
    const rawDoomed = and(
      lt(rawPayloads.fetchedAt, rawCutoff),
      workspaceId ? eq(rawPayloads.workspaceId, workspaceId) : undefined,
      or(sql`not (${inArray(rawPayloads.endpoint, RAW_KEEP_LATEST)})`, sql`exists (${newer})`),
    )!;
    report.rawPayloads = await this.batches(
      inTime,
      () => sql`delete from ${rawPayloads} where ${rawPayloads.id} in (
        select ${rawPayloads.id} from ${rawPayloads} where ${rawDoomed} limit ${BATCH})`,
    );
    if (!inTime()) return report;

    const runsDoomed = and(
      lt(syncRuns.startedAt, daysBefore(now, RETENTION_DAYS.syncRuns)),
      workspaceId ? eq(syncRuns.workspaceId, workspaceId) : undefined,
    )!;
    report.syncRuns = await this.batches(
      inTime,
      () => sql`delete from ${syncRuns} where ${syncRuns.id} in (
        select ${syncRuns.id} from ${syncRuns} where ${runsDoomed} limit ${BATCH})`,
    );
    if (!inTime()) return report;

    // Журнал pg_cron общий для всех компаний — в тестах с workspaceId не трогаем.
    if (!workspaceId) {
      report.cronRuns = await this.purgeCronRuns(daysBefore(now, RETENTION_DAYS.cronRuns), inTime);
      if (!inTime()) return report;
    }
    report.finished = true;
    return report;
  }

  /**
   * Журнал вызовов pg_cron (`tick` раз в минуту — 1 440 строк в сутки). Нет схемы cron или прав —
   * пропускаем с предупреждением: остальная очистка от этого не зависит и не повторяется каждую минуту.
   */
  private async purgeCronRuns(cutoff: Date, inTime: () => boolean): Promise<number> {
    try {
      const [has] = await this.db.execute<{ ok: boolean }>(
        sql`select to_regclass('cron.job_run_details') is not null as ok`,
      );
      if (!has?.ok) return 0;
      return await this.batches(
        inTime,
        () => sql`delete from cron.job_run_details where runid in (
          select runid from cron.job_run_details where end_time < ${cutoff.toISOString()} limit ${BATCH})`,
      );
    } catch (err) {
      this.log.warn(
        `cron.job_run_details не очищен: ${err instanceof Error ? err.message : String(err)}`,
      );
      return 0;
    }
  }

  /** Повторяет DELETE, пока он удаляет полную порцию и есть время. */
  private async batches(inTime: () => boolean, query: () => SQL): Promise<number> {
    let total = 0;
    while (inTime()) {
      const res = await this.db.execute(query());
      const n = res.count ?? 0;
      total += n;
      if (n < BATCH) break;
    }
    return total;
  }

  /** Атомарно отмечает запуск: из параллельных `tick` чистит только один. */
  private async claim(now: Date): Promise<boolean> {
    const rows = await this.db
      .insert(heartbeats)
      .values({ key: KEY, at: now })
      .onConflictDoUpdate({
        target: heartbeats.key,
        set: { at: now },
        setWhere: or(isNull(heartbeats.at), lt(heartbeats.at, new Date(now.getTime() - EVERY_MS))),
      })
      .returning({ key: heartbeats.key });
    return rows.length > 0;
  }

  /** Не дочистили — следующий `tick` возьмёт очистку снова. */
  private async release(): Promise<void> {
    await this.db.update(heartbeats).set({ at: null }).where(eq(heartbeats.key, KEY));
  }
}
