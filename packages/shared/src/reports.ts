import { TZDate } from '@date-fns/tz';
import { z } from 'zod';
import { type DayKey, shiftDay, toDayKey } from './time';

export const REPORT_PERIODS = [
  'today',
  'yesterday',
  'prev_week',
  'prev_month',
  'last7',
  'last30',
] as const;
export const reportPeriodSchema = z.enum(REPORT_PERIODS);
export type ReportPeriod = z.infer<typeof reportPeriodSchema>;

export const REPORT_PERIOD_LABELS: Record<ReportPeriod, string> = {
  today: 'Сегодня (на момент отправки)',
  yesterday: 'Вчера',
  prev_week: 'Прошлая неделя (пн–вс)',
  prev_month: 'Прошлый месяц',
  last7: 'Последние 7 дней',
  last30: 'Последние 30 дней',
};

export const REPORT_BLOCKS = ['kpis', 'channels', 'creatives', 'funnel'] as const;
export const reportBlockSchema = z.enum(REPORT_BLOCKS);
export type ReportBlock = z.infer<typeof reportBlockSchema>;
export const REPORT_BLOCK_LABELS: Record<ReportBlock, string> = {
  kpis: 'Ключевые цифры',
  channels: 'Каналы лидов',
  creatives: 'Лучшие креативы',
  funnel: 'Воронка WARD → Bitrix24',
};
/**
 * Блоки, которые выбирают в конструкторе. `creatives` остался в enum только ради сохранённых
 * отчётов: креативы теперь решает формат (PDF — все креативы, PNG — без них).
 */
export const REPORT_EDITABLE_BLOCKS = REPORT_BLOCKS.filter(
  (b): b is Exclude<ReportBlock, 'creatives'> => b !== 'creatives',
);

export const CREATIVES_PER_PAGE = 8;
/** Страниц в файле отчёта: первая — главные цифры, дальше креативы. */
export function reportPageCount(creatives: number): number {
  return 1 + Math.ceil(creatives / CREATIVES_PER_PAGE);
}
/** Креативы страницы `page` (с 2-й). */
export function creativesOnPage<T>(list: T[], page: number): T[] {
  const start = (page - 2) * CREATIVES_PER_PAGE;
  return list.slice(start, start + CREATIVES_PER_PAGE);
}

/** Как отправлять: картинкой (фото в чате) или PDF-файлом (документ). */
export const REPORT_FORMATS = ['png', 'pdf'] as const;
export const reportFormatSchema = z.enum(REPORT_FORMATS);
export type ReportFormat = z.infer<typeof reportFormatSchema>;
export const REPORT_FORMAT_LABELS: Record<ReportFormat, string> = {
  png: 'Картинка PNG',
  pdf: 'Файл PDF',
};

export const reportConfigSchema = z.object({
  period: reportPeriodSchema,
  blocks: z.array(reportBlockSchema).min(1),
  // У отчётов, сохранённых до появления формата, поля нет — это картинка.
  format: reportFormatSchema.default('png'),
});
export type ReportConfig = z.infer<typeof reportConfigSchema>;

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Время ЧЧ:ММ');
/** Расписание в поясе компании. Пустые weekdays / monthDays — «каждый день». */
export const reportScheduleSchema = z.object({
  times: z.array(timeSchema).min(1).max(6),
  /** 1 — понедельник … 7 — воскресенье. */
  weekdays: z.array(z.number().int().min(1).max(7)).default([]),
  monthDays: z.array(z.number().int().min(1).max(31)).default([]),
});
export type ReportSchedule = z.infer<typeof reportScheduleSchema>;

export const REPORT_TEMPLATES = ['day_summary', 'day_pulse', 'week', 'month', 'custom'] as const;
export const reportTemplateSchema = z.enum(REPORT_TEMPLATES);
export type ReportTemplate = z.infer<typeof reportTemplateSchema>;

export const TEMPLATE_DEFAULTS: Record<
  ReportTemplate,
  { name: string; config: ReportConfig; schedule: ReportSchedule }
> = {
  day_summary: {
    name: 'Итоги дня',
    config: { format: 'png', period: 'yesterday', blocks: ['kpis', 'channels'] },
    schedule: { times: ['09:00'], weekdays: [], monthDays: [] },
  },
  day_pulse: {
    name: 'Пульс дня',
    config: { format: 'png', period: 'today', blocks: ['kpis', 'channels'] },
    schedule: { times: ['13:00', '18:00'], weekdays: [], monthDays: [] },
  },
  week: {
    name: 'Неделя',
    config: { format: 'pdf', period: 'prev_week', blocks: ['kpis', 'channels', 'funnel'] },
    schedule: { times: ['10:00'], weekdays: [1], monthDays: [] },
  },
  month: {
    name: 'Месяц',
    config: { format: 'pdf', period: 'prev_month', blocks: ['kpis', 'channels', 'funnel'] },
    schedule: { times: ['10:00'], weekdays: [], monthDays: [1] },
  },
  custom: {
    name: 'Свой отчёт',
    config: { format: 'png', period: 'yesterday', blocks: ['kpis'] },
    schedule: { times: ['09:00'], weekdays: [], monthDays: [] },
  },
};

/** День недели (1 — пн) и число месяца дня `day`. */
function dayParts(day: DayKey): { weekday: number; monthDay: number } {
  const d = new Date(`${day}T12:00:00Z`);
  return { weekday: ((d.getUTCDay() + 6) % 7) + 1, monthDay: d.getUTCDate() };
}

/** Момент (UTC) времени `HH:MM` дня `day` в поясе `tz`. */
export function slotUtc(day: DayKey, time: string, tz: string): Date {
  const [h, m] = time.split(':').map(Number) as [number, number];
  const [y, mo, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(new TZDate(y, mo - 1, d, h, m, tz).getTime());
}

/**
 * Последний слот расписания в окне (now − windowMin, now]. null — сейчас ничего не положено.
 * Окно покрывает пропущенные минуты, если tick запоздал.
 */
export function dueSlot(
  schedule: ReportSchedule,
  tz: string,
  now: Date,
  windowMin = 10,
): Date | null {
  const today = toDayKey(now, tz);
  let best: Date | null = null;
  for (const day of [shiftDay(today, -1), today]) {
    const { weekday, monthDay } = dayParts(day);
    if (schedule.weekdays.length && !schedule.weekdays.includes(weekday)) continue;
    if (schedule.monthDays.length && !schedule.monthDays.includes(monthDay)) continue;
    for (const t of schedule.times) {
      const at = slotUtc(day, t, tz);
      const age = now.getTime() - at.getTime();
      if (age >= 0 && age < windowMin * 60_000 && (!best || at > best)) best = at;
    }
  }
  return best;
}

/** Период отчёта относительно дня слота (в поясе компании). */
export function reportPeriodRange(
  period: ReportPeriod,
  slotDay: DayKey,
): { from: DayKey; to: DayKey } {
  switch (period) {
    case 'today':
      return { from: slotDay, to: slotDay };
    case 'yesterday': {
      const y = shiftDay(slotDay, -1);
      return { from: y, to: y };
    }
    case 'last7':
      return { from: shiftDay(slotDay, -7), to: shiftDay(slotDay, -1) };
    case 'last30':
      return { from: shiftDay(slotDay, -30), to: shiftDay(slotDay, -1) };
    case 'prev_week': {
      const { weekday } = dayParts(slotDay);
      const thisMonday = shiftDay(slotDay, -(weekday - 1));
      return { from: shiftDay(thisMonday, -7), to: shiftDay(thisMonday, -1) };
    }
    case 'prev_month': {
      const [y, m] = slotDay.split('-').map(Number) as [number, number];
      const first = `${y}-${String(m).padStart(2, '0')}-01`;
      const lastPrev = shiftDay(first, -1);
      return { from: `${lastPrev.slice(0, 7)}-01`, to: lastPrev };
    }
  }
}
