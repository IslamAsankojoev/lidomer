import { Inject, Injectable } from '@nestjs/common';
import { type Db, heartbeats, MIGRATIONS_COUNT } from '@lidomer/db';
import { eq, sql } from 'drizzle-orm';
import { DB } from '../db/db.module';
import { TelegramService } from '../reports/telegram.service';

/** ТЗ, Этап 6: `tick` не вызывался дольше 10 минут — алерт. */
export const TICK_STALE_MS = 10 * 60_000;
const KEY = 'tick';
/** Строка сторожа миграций в `heartbeats`: `alerted_at` — алерт об отставшей базе уже ушёл. */
const SCHEMA_KEY = 'migrations';

export type WatchdogVerdict = 'ok' | 'stale' | 'still_stale' | 'recovered';

/** Что делать сторожу: сообщить о пропаже пульса один раз и один раз — о восстановлении. */
export function watchdogVerdict(
  beat: { at: Date | null; alertedAt: Date | null } | undefined,
  now: Date,
  staleMs = TICK_STALE_MS,
): WatchdogVerdict {
  const at = beat?.at ?? null;
  const stale = !at || now.getTime() - at.getTime() > staleMs;
  if (stale) return beat?.alertedAt ? 'still_stale' : 'stale';
  return beat?.alertedAt ? 'recovered' : 'ok';
}

export type SchemaVerdict = 'ok' | 'behind' | 'still_behind' | 'recovered';

/** База отстала от миграций кода: сообщить один раз и один раз — когда догнала. */
export function schemaVerdict(
  applied: number,
  expected: number,
  alertedAt: Date | null,
): SchemaVerdict {
  if (applied < expected) return alertedAt ? 'still_behind' : 'behind';
  return alertedAt ? 'recovered' : 'ok';
}

export interface SchemaCheck {
  verdict: SchemaVerdict;
  applied: number;
  expected: number;
}

@Injectable()
export class Watchdog {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(TelegramService) private readonly telegram: TelegramService,
  ) {}

  /** Пульс: вызывается в начале каждого `tick`. */
  async beat(now = new Date()): Promise<void> {
    await this.db
      .insert(heartbeats)
      .values({ key: KEY, at: now })
      .onConflictDoUpdate({ target: heartbeats.key, set: { at: now } });
  }

  async check(now = new Date()): Promise<{ verdict: WatchdogVerdict; lastTickAt: string | null }> {
    const [beat] = await this.db.select().from(heartbeats).where(eq(heartbeats.key, KEY));
    const verdict = watchdogVerdict(beat, now);
    const at = beat?.at ?? null;
    if (verdict === 'stale') {
      const minutes = at ? Math.round((now.getTime() - at.getTime()) / 60_000) : null;
      await this.telegram.systemAlert(
        `⚠️ Фоновая работа ${minutes === null ? 'ещё ни разу не запускалась' : `не запускалась ${minutes} мин`}: ` +
          'данные и отчёты не обновляются. Проверьте Supabase Cron (задача lidomer-tick) и api.',
      );
      await this.db
        .insert(heartbeats)
        .values({ key: KEY, at: null, alertedAt: now })
        .onConflictDoUpdate({ target: heartbeats.key, set: { alertedAt: now } });
    } else if (verdict === 'recovered') {
      await this.telegram.systemAlert('✅ Фоновая работа снова идёт: данные и отчёты обновляются.');
      await this.db.update(heartbeats).set({ alertedAt: null }).where(eq(heartbeats.key, KEY));
    }
    return { verdict, lastTickAt: at?.toISOString() ?? null };
  }

  /**
   * Применены ли в базе все миграции, которые знает код. Иначе код падает на новых таблицах и
   * колонках (так 23.11.2026 перестал пересчитываться журнал лидов: не было `reconcile_state`).
   */
  async checkSchema(now = new Date()): Promise<SchemaCheck> {
    const applied = await this.db
      .execute<{ n: number }>(sql`select count(*)::int as n from drizzle.__drizzle_migrations`)
      .then((rows) => Number(rows[0]?.n ?? 0))
      .catch(() => 0);
    const expected = MIGRATIONS_COUNT;
    const [row] = await this.db.select().from(heartbeats).where(eq(heartbeats.key, SCHEMA_KEY));
    const verdict = schemaVerdict(applied, expected, row?.alertedAt ?? null);
    if (verdict === 'behind') {
      await this.telegram.systemAlert(
        `⚠️ База отстала от кода: применено миграций ${applied} из ${expected}. ` +
          'Новые функции и пересчёт лидов могут падать. Выполните pnpm db:migrate.',
      );
      await this.db
        .insert(heartbeats)
        .values({ key: SCHEMA_KEY, at: now, alertedAt: now })
        .onConflictDoUpdate({ target: heartbeats.key, set: { at: now, alertedAt: now } });
    } else if (verdict === 'recovered') {
      await this.telegram.systemAlert('✅ Миграции базы применены: база соответствует коду.');
      await this.db
        .update(heartbeats)
        .set({ at: now, alertedAt: null })
        .where(eq(heartbeats.key, SCHEMA_KEY));
    }
    return { verdict, applied, expected };
  }
}
