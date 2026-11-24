import { type Db, integrations, reconcileState } from '@lidomer/db';
import { eq } from 'drizzle-orm';

/**
 * Свежесть журнала лидов и метрик. Источники могут синхронизироваться успешно, а пересборка —
 * падать; тогда кабинет и отчёты показывают старые цифры. Здесь — признак «журнал устарел».
 */

/** Источник синхронизировался позже последней удачной пересборки больше чем на это — журнал отстал. */
export const JOURNAL_LAG_MS = 30 * 60_000;

export interface JournalStateIn {
  seenAt: Date;
  failedAt: Date | null;
}

export interface JournalHealth {
  /** Последняя удачная пересборка; null — ещё не было. */
  updatedAt: Date | null;
  stale: boolean;
}

/** Время до первой удачной пересборки (строку создала запись об ошибке) — не время пересборки. */
const isSet = (d: Date) => d.getTime() > 0;

export function journalHealth(
  state: JournalStateIn | undefined,
  lastSyncs: (Date | null)[],
): JournalHealth {
  const updatedAt = state && isSet(state.seenAt) ? state.seenAt : null;
  const synced = lastSyncs.filter((d): d is Date => d !== null).map((d) => d.getTime());
  if (state?.failedAt) return { updatedAt, stale: true };
  if (!synced.length) return { updatedAt, stale: false };
  if (!updatedAt) return { updatedAt, stale: true };
  return { updatedAt, stale: Math.max(...synced) - updatedAt.getTime() > JOURNAL_LAG_MS };
}

/** Свежесть журнала компании по базе. */
export async function loadJournalHealth(db: Db, workspaceId: string): Promise<JournalHealth> {
  const [[state], sources] = await Promise.all([
    db
      .select({ seenAt: reconcileState.seenAt, failedAt: reconcileState.failedAt })
      .from(reconcileState)
      .where(eq(reconcileState.workspaceId, workspaceId)),
    db
      .select({ lastSyncAt: integrations.lastSyncAt })
      .from(integrations)
      .where(eq(integrations.workspaceId, workspaceId)),
  ]);
  return journalHealth(
    state,
    sources.map((s) => s.lastSyncAt),
  );
}

/** Ошибка Postgres: у неё есть код SQLSTATE из 5 символов. */
function pgError(err: unknown): { message: string; code: string } | null {
  for (let e: unknown = err, i = 0; e && i < 5; e = (e as { cause?: unknown }).cause, i++) {
    const { code, message } = e as { code?: unknown; message?: unknown };
    if (typeof code === 'string' && code.length === 5 && typeof message === 'string')
      return { message, code };
  }
  return null;
}

/**
 * Текст ошибки пересборки для лога, базы и алерта. Ошибка запроса drizzle несёт в тексте сам запрос
 * и его параметры (телефоны, имена) — берём только сообщение Postgres, в нём нет значений строк.
 */
export function reconcileErrorText(err: unknown): string {
  const pg = pgError(err);
  if (pg) return `${pg.message} (код ${pg.code})`.slice(0, 300);
  if (!(err instanceof Error)) return 'неизвестная ошибка';
  if (err.message.startsWith('Failed query')) return 'ошибка запроса к базе';
  return `${err.name}: ${err.message}`.slice(0, 300);
}
