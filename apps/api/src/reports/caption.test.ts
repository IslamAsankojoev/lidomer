import type { ReportSnapshot } from '@lidomer/shared';
import { describe, expect, it } from 'vitest';
import { buildCaption, periodLabel } from './caption';

const snap = (p: Partial<ReportSnapshot> = {}): ReportSnapshot => ({
  workspaceName: 'lidforce',
  reportName: 'Итоги дня',
  period: { from: '2026-11-16', to: '2026-11-16' },
  generatedAt: '2026-11-17T03:00:00Z',
  timezone: 'Asia/Bishkek',
  blocks: ['kpis', 'channels', 'creatives'],
  current: {
    adLeads: 116,
    organicLeads: 8,
    directUnknownLeads: 12,
    otherLeads: 40,
    withPhone: 150,
    sales: 0,
    spendMinor: null,
    cplFactMinor: null,
  },
  before: { adLeads: 100 },
  spendCurrency: null,
  fxRate: 87.45,
  creatives: [{ title: 'Риэлт 2', subtitle: null, leads: 30, sales: 0, previewUrl: null }],
  funnel: null,
  sources: [{ name: 'Ward', at: '09:01', ok: true }],
  dataNote: null,
  ...p,
});

describe('подпись отчёта', () => {
  it('нет Meta — «нет данных», а не ноль; изменение к прошлому периоду', () => {
    const { caption } = buildCaption(snap());
    expect(caption).toContain('Лиды с рекламы: 116 (↑16%)');
    expect(caption).toContain('Цена за лид: нет данных с Meta');
    expect(caption).not.toMatch(/\$0|0 сом/);
    expect(caption).toContain('1. Риэлт 2 — 30 лидов');
  });
  it('расход в валюте кабинета и ≈ сомы', () => {
    const { caption } = buildCaption(
      snap({
        spendCurrency: 'USD',
        current: { ...snap().current, spendMinor: 12345, cplFactMinor: 106 },
      }),
    );
    expect(caption).toMatch(/Расход: 123,45\s\$ \(≈ 10\s796 сом\)/);
  });
  it('пометка о несвежих данных', () => {
    expect(buildCaption(snap({ dataNote: 'данные Ward на 08:40' })).caption).toContain(
      '⚠️ данные Ward на 08:40',
    );
  });
  it('длинный текст делится: подпись ≤ 1024, остальное — отдельно', () => {
    const many = Array.from({ length: 3 }, () => ({
      title: 'x'.repeat(400),
      subtitle: null,
      leads: 1,
      sales: 0,
      previewUrl: null,
    }));
    const { caption, rest } = buildCaption(snap({ creatives: many }));
    expect(caption.length).toBeLessThanOrEqual(1024);
    expect(rest).not.toBeNull();
  });
  it('период', () => {
    expect(periodLabel('2026-11-16', '2026-11-16')).toBe('16 ноября');
    expect(periodLabel('2026-11-09', '2026-11-15')).toBe('9 ноября — 15 ноября');
  });
});
