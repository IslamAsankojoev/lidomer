import type { ReportSnapshot } from '@lidomer/shared';
import { describe, expect, it } from 'vitest';
import { buildCaption, periodLabel } from './caption';

const snap = (p: Partial<ReportSnapshot> = {}): ReportSnapshot => ({
  workspaceName: 'lidforce',
  reportName: 'Итоги дня',
  period: { from: '2026-11-16', to: '2026-11-16' },
  periodLabel: 'Вчера',
  format: 'png',
  compare: true,
  generatedAt: '2026-11-17T03:00:00Z',
  timezone: 'Asia/Bishkek',
  blocks: ['kpis', 'channels'],
  current: { adLeads: 116, withPhone: 150, sales: 3, spendMinor: 12345, cplFactMinor: 106 },
  before: { adLeads: 100 },
  spendCurrency: 'USD',
  fxRate: 87.45,
  creatives: [],
  funnel: null,
  sources: [{ name: 'WARD', at: '09:01', ok: true }],
  dataNote: null,
  marketer: 'm@example.com',
  ...p,
});

describe('подпись отчёта', () => {
  it('одна строка: название и дата, без цифр метрик', () => {
    const caption = buildCaption(snap());
    expect(caption).toBe('📊 Итоги дня · 16 ноября');
    expect(caption).not.toMatch(/Лиды|Расход|\$|116/);
  });
  it('несвежие данные — второй строкой с ⚠️', () => {
    expect(buildCaption(snap({ dataNote: 'данные WARD на 08:40' }))).toBe(
      '📊 Итоги дня · 16 ноября\n⚠️ данные WARD на 08:40',
    );
  });
  it('период из нескольких дней', () => {
    expect(buildCaption(snap({ period: { from: '2026-11-09', to: '2026-11-15' } }))).toBe(
      '📊 Итоги дня · 9 ноября — 15 ноября',
    );
    expect(periodLabel('2026-11-16', '2026-11-16')).toBe('16 ноября');
  });
});
