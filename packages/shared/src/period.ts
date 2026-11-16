import { TZDate } from '@date-fns/tz';
import { startOfMonth, startOfWeek, format, subDays } from 'date-fns';
import { z } from 'zod';
import { type DayKey, isDayKey, shiftDay, today } from './time';

/** Готовые периоды панели «Сегодня · Неделя · Месяц» и произвольный. */
export const PERIOD_PRESETS = ['today', 'yesterday', 'week', 'month', 'last7', 'last30', 'custom'] as const;
export const periodPresetSchema = z.enum(PERIOD_PRESETS);
export type PeriodPreset = z.infer<typeof periodPresetSchema>;

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  today: 'Сегодня',
  yesterday: 'Вчера',
  week: 'Неделя',
  month: 'Месяц',
  last7: '7 дней',
  last30: '30 дней',
  custom: 'Период',
};

export const dayKeySchema = z.string().refine(isDayKey, 'Ожидается дата YYYY-MM-DD');

/** Период запроса: дни включительно, в поясе компании. */
export const periodSchema = z
  .object({ from: dayKeySchema, to: dayKeySchema })
  .refine((p) => p.from <= p.to, 'Начало периода позже конца');
export type Period = z.infer<typeof periodSchema>;

/**
 * Превращает готовый период в даты. Неделя — с понедельника, месяц — с 1-го числа,
 * оба по сегодняшний день включительно.
 */
export function resolvePreset(
  preset: Exclude<PeriodPreset, 'custom'>,
  timeZone: string,
  now: Date = new Date(),
): Period {
  const t = today(timeZone, now);
  const local = new TZDate(now, timeZone);
  const fmt = (d: Date): DayKey => format(d, 'yyyy-MM-dd');
  switch (preset) {
    case 'today':
      return { from: t, to: t };
    case 'yesterday': {
      const y = shiftDay(t, -1);
      return { from: y, to: y };
    }
    case 'week':
      return { from: fmt(startOfWeek(local, { weekStartsOn: 1 })), to: t };
    case 'month':
      return { from: fmt(startOfMonth(local)), to: t };
    case 'last7':
      return { from: fmt(subDays(local, 6)), to: t };
    case 'last30':
      return { from: fmt(subDays(local, 29)), to: t };
  }
}
