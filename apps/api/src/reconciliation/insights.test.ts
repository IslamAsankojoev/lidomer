import type { LeadItem } from '@lidomer/shared';
import { describe, expect, it } from 'vitest';
import { normalizeRooms } from './insights.repository';
import { buildTimeline } from './timeline';

describe('комнаты из анкеты', () => {
  it('сводит варианты к одному виду', () => {
    expect(normalizeRooms('2')).toBe('2');
    expect(normalizeRooms('1 или 2')).toBe('1–2');
    expect(normalizeRooms('1-2')).toBe('1–2');
    expect(normalizeRooms('Студия')).toBe('студия');
    expect(normalizeRooms('')).toBeNull();
    expect(normalizeRooms(null)).toBeNull();
  });
});

const item = (p: Partial<LeadItem>): LeadItem => ({
  id: 'ward:1',
  origin: 'ward',
  createdAt: '2026-11-10T08:00:00.000Z',
  day: '2026-11-10',
  name: null,
  phone: null,
  instagram: null,
  channel: 'ad',
  adKey: '1202',
  adName: 'Объявление',
  campaignName: null,
  adsetName: null,
  postId: null,
  wardLeadId: 1,
  dealId: '1001',
  stageName: 'ДДУ',
  status: 'won',
  amountMinor: null,
  currency: 'USD',
  isRepeat: false,
  repeatOf: null,
  flags: [],
  ...p,
});

describe('хронология лида', () => {
  it('Ward → сделка → продажа, по времени', () => {
    const t = buildTimeline(
      item({}),
      {
        ward: {
          createdAt: new Date('2026-11-10T08:00:00Z'),
          sourceText: 'Instagram, комментарий',
          status: 'won',
          adTitle: null,
        },
        deal: {
          title: 'Сделка',
          createdAt: new Date('2026-11-10T08:00:05Z'),
          updatedAt: new Date('2026-11-12T10:00:00Z'),
          closedAt: new Date('2026-11-12T10:00:00Z'),
          stageName: 'ДДУ',
          semantics: 'S',
        },
      },
      [],
    );
    expect(t.map((e) => [e.kind, e.title])).toEqual([
      ['ward_lead', 'Написал в Instagram — лид Ward'],
      ['deal_created', 'Сделка №1001 в Bitrix24'],
      ['deal_closed', 'Продажа'],
    ]);
  });
  it('лид без сделки — явная отметка', () => {
    const t = buildTimeline(
      item({ dealId: null }),
      {
        ward: {
          createdAt: new Date('2026-11-10T08:00:00Z'),
          sourceText: null,
          status: 'new',
          adTitle: null,
        },
        deal: null,
      },
      [],
    );
    expect(t.at(-1)!.title).toBe('Сделки в Bitrix24 нет');
  });
});
