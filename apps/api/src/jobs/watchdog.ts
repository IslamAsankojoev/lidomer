import { Inject, Injectable } from '@nestjs/common';
import { type Db, heartbeats } from '@lidomer/db';
import { eq } from 'drizzle-orm';
import { DB } from '../db/db.module';
import { TelegramService } from '../reports/telegram.service';

/** ТЗ, Этап 6: `tick` не вызывался дольше 10 минут — алерт. */
export const TICK_STALE_MS = 10 * 60_000;
const KEY = 'tick';

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
}
