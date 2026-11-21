import type { ReportSnapshot } from '@lidomer/shared';

const dayFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', timeZone: 'UTC' });

/** «16 ноября» или «9 ноября — 15 ноября». */
export function periodLabel(from: string, to: string): string {
  const f = dayFmt.format(new Date(`${from}T12:00:00Z`));
  if (from === to) return f;
  return `${f} — ${dayFmt.format(new Date(`${to}T12:00:00Z`))}`;
}

/**
 * Подпись к файлу отчёта — одна строка: все цифры только в самом файле, чтобы его открывали.
 * Вторая строка — только при несвежих данных («без вранья»). Без имён и телефонов клиентов.
 */
export function buildCaption(s: ReportSnapshot): string {
  const line = `📊 ${s.reportName} · ${periodLabel(s.period.from, s.period.to)}`;
  return s.dataNote ? `${line}\n⚠️ ${s.dataNote}` : line;
}
