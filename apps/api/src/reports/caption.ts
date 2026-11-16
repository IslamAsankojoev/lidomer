import {
  change,
  formatApproxSom,
  formatMoney,
  type ReportSnapshot,
  toMajor,
} from '@lidomer/shared';
import { CAPTION_LIMIT } from './telegram.client';

const int = (n: number) => new Intl.NumberFormat('ru-RU').format(n);
const dayFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', timeZone: 'UTC' });

/** «16 ноября» или «9 — 15 ноября». */
export function periodLabel(from: string, to: string): string {
  const f = dayFmt.format(new Date(`${from}T12:00:00Z`));
  if (from === to) return f;
  return `${f} — ${dayFmt.format(new Date(`${to}T12:00:00Z`))}`;
}

const delta = (cur: number | null, prev: number | null) => {
  const c = change(cur, prev);
  return c === null ? '' : ` (${c > 0 ? '↑' : c < 0 ? '↓' : ''}${Math.abs(c)}%)`;
};

function moneyLine(s: ReportSnapshot, minor: number | null): string {
  if (minor === null || !s.spendCurrency) return 'нет данных с Meta';
  const main = formatMoney({ amountMinor: minor, currency: s.spendCurrency });
  const som = s.fxRate
    ? ` (${formatApproxSom(toMajor({ amountMinor: minor, currency: s.spendCurrency }) * s.fxRate)})`
    : '';
  return main + som;
}

/**
 * Подпись к картинке отчёта. Без имён и телефонов клиентов. «Нет данных» — словами, никогда не нулём.
 * Возвращает подпись (≤ 1024) и продолжение, если не влезло.
 */
export function buildCaption(s: ReportSnapshot): { caption: string; rest: string | null } {
  const c = s.current;
  const b = s.before;
  const lines: string[] = [`📊 ${s.reportName} · ${periodLabel(s.period.from, s.period.to)}`, ''];
  if (s.blocks.includes('kpis')) {
    lines.push(
      `Лиды с рекламы: ${int(c.adLeads ?? 0)}${delta(c.adLeads ?? null, b.adLeads ?? null)}`,
    );
    lines.push(`Цена за лид: ${moneyLine(s, c.cplFactMinor ?? null)}`);
    lines.push(`Расход: ${moneyLine(s, c.spendMinor ?? null)}`);
    lines.push(`С телефоном: ${int(c.withPhone ?? 0)} · Продажи: ${int(c.sales ?? 0)}`);
  }
  if (s.blocks.includes('channels')) {
    lines.push(
      `Органика: ${int(c.organicLeads ?? 0)} · Direct без источника: ${int(c.directUnknownLeads ?? 0)} · Другие: ${int(c.otherLeads ?? 0)}`,
    );
  }
  if (s.blocks.includes('funnel') && s.funnel) {
    const f = s.funnel;
    lines.push(
      `Ward: переписок ${int(f.conversations)} → лидов ${int(f.wardLeads)} → сделок ${int(f.withDeal)} → продаж ${int(f.sales)}`,
    );
  }
  if (s.blocks.includes('creatives') && s.creatives.length) {
    lines.push('', 'Лучшие креативы:');
    s.creatives
      .slice(0, 3)
      .forEach((cr, i) => lines.push(`${i + 1}. ${cr.title} — ${int(cr.leads)} лидов`));
  }
  lines.push('');
  if (s.dataNote) lines.push(`⚠️ ${s.dataNote}`);
  lines.push(`${s.workspaceName} · ${s.sources.map((x) => `${x.name} ${x.at ?? '—'}`).join(', ')}`);

  const full = lines.join('\n').trim();
  if (full.length <= CAPTION_LIMIT) return { caption: full, rest: null };
  // Длинный текст: в подпись — до последней целой строки, остальное — отдельным сообщением.
  const cut = full.lastIndexOf('\n', CAPTION_LIMIT - 1);
  return { caption: full.slice(0, cut), rest: full.slice(cut + 1) };
}
