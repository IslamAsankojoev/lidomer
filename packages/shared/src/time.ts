import { TZDate } from '@date-fns/tz';
import { addDays, format, startOfDay } from 'date-fns';

/** Часовой пояс компании по умолчанию. */
export const DEFAULT_TIMEZONE = 'Asia/Bishkek';

/** Календарный день вида `YYYY-MM-DD`. */
export type DayKey = string;

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDayKey(value: string): value is DayKey {
  if (!DAY_KEY_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value);
}

/** День, к которому относится момент времени `at` в поясе `timeZone`. */
export function toDayKey(at: Date, timeZone: string): DayKey {
  return format(new TZDate(at, timeZone), 'yyyy-MM-dd');
}

/** Начало дня `day` в поясе `timeZone` как момент UTC. */
export function dayStartUtc(day: DayKey, timeZone: string): Date {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(new TZDate(y, m - 1, d, timeZone).getTime());
}

/**
 * Полуоткрытый интервал UTC [start, end) для дней `from`..`to` включительно
 * в поясе `timeZone`.
 */
export function dayRangeUtc(from: DayKey, to: DayKey, timeZone: string): { start: Date; end: Date } {
  const start = dayStartUtc(from, timeZone);
  const end = dayStartUtc(shiftDay(to, 1), timeZone);
  return { start, end };
}

/** Сдвиг календарного дня на `days` (без учёта пояса — это чистая календарная арифметика). */
export function shiftDay(day: DayKey, days: number): DayKey {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return format(addDays(new Date(y, m - 1, d), days), 'yyyy-MM-dd');
}

/** Сегодняшний день в поясе компании. */
export function today(timeZone: string, now: Date = new Date()): DayKey {
  return toDayKey(startOfDay(new TZDate(now, timeZone)), timeZone);
}
