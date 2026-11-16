import type { Db } from '@lidomer/db';
import type { IntegrationType } from '@lidomer/shared';
import type { z } from 'zod';

/** Задача синхронизации: «источник × день» или другая короткая порция. */
export interface JobSpec {
  /** Например `ward:day`, `b24:deals`, `meta:insights`. */
  kind: string;
  params: Record<string, unknown>;
}

export interface JobResult {
  records: number;
  /** Порция не закончена — продолжить с этими параметрами следующей задачей. */
  continueWith?: Record<string, unknown>;
}

/** Запись ответа внешнего API в raw_payloads. */
export type RawRecorder = (entry: {
  endpoint: string;
  request: Record<string, unknown>;
  httpStatus: number;
  response: unknown;
}) => Promise<void>;

export interface SyncContext {
  db: Db;
  workspaceId: string;
  integrationId: string;
  timezone: string;
  recordRaw: RawRecorder;
  /** Момент, к которому задача должна закончиться (мс). */
  deadline: number;
  now: Date;
}

/** Когда какая плановая задача ставилась в очередь последний раз (ISO). */
export type SyncState = Record<string, string>;

export interface TestResult {
  /** Что показать в карточке: название аккаунта, портал и т. п. */
  details: Record<string, string>;
  warnings: string[];
}

/** Общий интерфейс источника: проверить подключение, спланировать и выполнить задачи. */
export interface SourceAdapter<S = unknown> {
  type: IntegrationType;
  secretsSchema: z.ZodType<S>;
  /**
   * Превратить то, что прислала форма, в секреты (например, обменять код входа Meta на токен).
   * Если не задано — форма присылает секреты как есть.
   */
  prepareSecrets?(input: unknown): Promise<unknown>;
  /** Секреты для показа — только маской. */
  mask(secrets: S): Record<string, string>;
  test(secrets: S, recordRaw?: RawRecorder): Promise<TestResult>;
  /** Задачи сразу после подключения (история). */
  initialJobs(now: Date, timezone: string): JobSpec[];
  /** Плановые задачи, которым пришло время, и новое состояние расписания. */
  dueJobs(state: SyncState, now: Date, timezone: string): { jobs: JobSpec[]; state: SyncState };
  run(job: JobSpec, secrets: S, ctx: SyncContext): Promise<JobResult>;
}

/** Пришло ли время задачи с интервалом `everyMs`. */
export function isDue(state: SyncState, key: string, now: Date, everyMs: number): boolean {
  const last = state[key] ? Date.parse(state[key]) : 0;
  return now.getTime() - last >= everyMs;
}
