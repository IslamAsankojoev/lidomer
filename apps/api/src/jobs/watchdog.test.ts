import { describe, expect, it } from 'vitest';
import { TICK_STALE_MS, watchdogVerdict } from './watchdog';

const now = new Date('2026-11-17T09:00:00Z');
const ago = (ms: number) => new Date(now.getTime() - ms);

describe('watchdogVerdict', () => {
  it('свежий пульс без алерта — всё в порядке', () => {
    expect(watchdogVerdict({ at: ago(60_000), alertedAt: null }, now)).toBe('ok');
    // Ровно на пороге ещё не тревога.
    expect(watchdogVerdict({ at: ago(TICK_STALE_MS), alertedAt: null }, now)).toBe('ok');
  });

  it('пульс старше 10 минут или его нет — один алерт, дальше молчим', () => {
    expect(watchdogVerdict({ at: ago(TICK_STALE_MS + 1), alertedAt: null }, now)).toBe('stale');
    expect(watchdogVerdict(undefined, now)).toBe('stale');
    expect(watchdogVerdict({ at: null, alertedAt: null }, now)).toBe('stale');
    expect(watchdogVerdict({ at: ago(30 * 60_000), alertedAt: ago(20 * 60_000) }, now)).toBe(
      'still_stale',
    );
  });

  it('пульс вернулся после алерта — сообщаем о восстановлении', () => {
    expect(watchdogVerdict({ at: ago(30_000), alertedAt: ago(5 * 60_000) }, now)).toBe('recovered');
  });
});
