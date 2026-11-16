import { DEFAULT_COUNTING, type DealStatus } from '@lidomer/shared';
import { describe, expect, it } from 'vitest';
import { buildMetrics } from './build-metrics';
import { type DealIn, reconcile, type ReconcileInput, type WardLeadIn } from './reconcile';

// Фейковые данные для тестов (не реальные люди).
const TZ = 'Asia/Bishkek';
const ward = (id: number, extra: Partial<WardLeadIn> = {}): WardLeadIn => ({
  id,
  createdAt: new Date('2026-11-10T08:00:00Z'),
  name: `Лид ${id}`,
  phone: null,
  instagram: `@user${id}`,
  status: 'in_work',
  sourceKind: 'ad',
  sourceAdId: '120257331929720492',
  adTitle: 'Реклама 1',
  sourcePostId: null,
  crmEntity: 'deal',
  crmId: String(1000 + id),
  ...extra,
});
const deal = (id: string, extra: Partial<DealIn> = {}): DealIn => ({
  id,
  createdAt: new Date('2026-11-10T08:00:05Z'),
  stageId: 'NEW',
  amountMinor: null,
  currency: 'USD',
  sourceId: 'WEB',
  sourceDescription: null,
  utmSource: null,
  utmMedium: null,
  utmCampaign: null,
  utmContent: null,
  contactId: null,
  ...extra,
});
const input = (p: Partial<ReconcileInput>): ReconcileInput => ({
  timezone: TZ,
  settings: DEFAULT_COUNTING,
  wardLeads: [],
  deals: [],
  contacts: new Map(),
  stageStatus: new Map<string, DealStatus>([
    ['NEW', 'in_work'],
    ['WON', 'won'],
    ['LOSE', 'lost'],
  ]),
  overrides: [],
  metaAdIds: null,
  ...p,
});

describe('сверка', () => {
  it('лид Ward и его сделка — одна строка со статусом и суммой сделки', () => {
    const rows = reconcile(
      input({
        wardLeads: [ward(1)],
        deals: [deal('1001', { stageId: 'WON', amountMinor: 9_000_000 })],
      }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'ward:1',
      dealId: '1001',
      status: 'won',
      amountMinor: 9_000_000,
      channel: 'ad',
    });
  });

  it('лид без сделки — флаг и статус Ward', () => {
    const [r] = reconcile(
      input({ wardLeads: [ward(2, { crmEntity: 'lead', crmId: null, status: 'new' })] }),
    );
    expect(r!.flags).toContain('no_deal');
    expect(r!.status).toBe('in_work');
  });

  it('Direct без метки — отдельная группа, пост — органика', () => {
    const rows = reconcile(
      input({
        wardLeads: [
          ward(3, { sourceKind: 'direct', sourceAdId: null, crmId: null }),
          ward(4, { sourceKind: 'post', sourceAdId: null, sourcePostId: '1796', crmId: null }),
        ],
      }),
    );
    expect(rows.map((r) => r.channel).sort()).toEqual(['direct_unknown', 'organic']);
  });

  it('лид-форма с UTM ig — реклама с объявлением из UTM, телефон из контакта', () => {
    const [r] = reconcile(
      input({
        deals: [
          deal('5001', {
            sourceId: '4',
            utmSource: 'ig',
            utmMedium: 'Ширик 35',
            utmCampaign: '09.11',
            utmContent: '1',
            contactId: 'c1',
          }),
        ],
        contacts: new Map([['c1', { name: 'Контакт', phone: '+996555000001' }]]),
      }),
    );
    expect(r).toMatchObject({
      origin: 'b24',
      channel: 'ad',
      adKey: 'utm:09.11 › Ширик 35 › 1',
      campaignName: '09.11',
      adsetName: 'Ширик 35',
      phone: '+996555000001',
    });
  });

  it('источник без UTM — другой канал; в настройках — реклама или исключён', () => {
    const deals = [deal('6001', { sourceId: 'CALL' }), deal('6002', { sourceId: 'UC_OESAEK' })];
    expect(reconcile(input({ deals })).map((r) => r.channel)).toEqual(['other', 'other']);
    const rows = reconcile(
      input({
        deals,
        settings: { ...DEFAULT_COUNTING, adSourceIds: ['CALL'], excludedSourceIds: ['UC_OESAEK'] },
      }),
    );
    expect(rows.map((r) => [r.dealId, r.channel])).toEqual([['6001', 'ad']]);
  });

  it('сделка Ward с рекламной меткой без лида в выгрузке — флаг', () => {
    const [r] = reconcile(
      input({
        deals: [
          deal('7001', {
            sourceDescription: 'WARD Direct · Instagram, комментарий · реклама #120257331929',
          }),
        ],
      }),
    );
    expect(r).toMatchObject({ channel: 'ad', adId: '120257331929' });
    expect(r!.flags).toContain('ad_label_without_lead');
  });

  it('день — по Бишкеку: 19:30 UTC это уже следующий день', () => {
    const [r] = reconcile(
      input({ wardLeads: [ward(8, { createdAt: new Date('2026-11-15T19:30:00Z'), crmId: null })] }),
    );
    expect(r!.day).toBe('2026-11-16');
  });

  it('повтор: тот же телефон в Ward и в лид-форме в окне 30 дней; после окна — новый лид', () => {
    const rows = reconcile(
      input({
        wardLeads: [
          ward(9, {
            phone: '0555 000 009',
            crmId: null,
            createdAt: new Date('2026-10-01T10:00:00Z'),
          }),
        ],
        deals: [
          deal('9001', { contactId: 'c9', createdAt: new Date('2026-10-20T10:00:00Z') }),
          deal('9002', { contactId: 'c9', createdAt: new Date('2026-11-05T10:00:00Z') }),
        ],
        contacts: new Map([['c9', { name: null, phone: '+996555000009' }]]),
      }),
    );
    expect(rows.map((r) => [r.id, r.isRepeat, r.repeatOf])).toEqual([
      ['ward:9', false, null],
      ['b24:9001', true, 'ward:9'],
      ['b24:9002', false, null],
    ]);
  });

  it('ручные правки: канал меняется, исключённый лид пропадает, источники не трогаются', () => {
    const wardLeads = [ward(10, { crmId: null }), ward(11, { crmId: null, instagram: '@other' })];
    const rows = reconcile(
      input({
        wardLeads,
        overrides: [
          { id: 1, leadId: 'ward:10', field: 'channel', value: 'organic' },
          { id: 2, leadId: 'ward:11', field: 'excluded', value: true },
        ],
      }),
    );
    expect(rows.map((r) => [r.id, r.channel, r.overrides])).toEqual([['ward:10', 'organic', [1]]]);
    expect(wardLeads[0]!.sourceKind).toBe('ad');
  });
});

describe('метрики по дням', () => {
  it('сумма лидов по метрикам = число не повторных строк журнала', () => {
    const rows = reconcile(
      input({
        wardLeads: [
          ward(1),
          ward(2, { crmId: null, phone: '+996555000002' }),
          ward(3, { sourceKind: 'post', sourceAdId: null, crmId: null }),
        ],
        deals: [
          deal('1001', { stageId: 'WON', amountMinor: 500 }),
          deal('8001', { utmSource: 'fb', utmCampaign: 'К', contactId: 'c' }),
        ],
        contacts: new Map([['c', { name: null, phone: '+996555000002' }]]),
      }),
    );
    const m = buildMetrics(rows, null);
    const leads = m.reduce((a, r) => a + r.leads, 0);
    expect(leads).toBe(rows.filter((r) => !r.isRepeat).length);
    expect(m.reduce((a, r) => a + r.repeats, 0)).toBe(1);
    expect(m.reduce((a, r) => a + r.sales, 0)).toBe(1);
    expect(m.reduce((a, r) => a + r.salesAmountMinor, 0)).toBe(500);
    // Без Meta расход — нет данных, а не ноль.
    expect(m.every((r) => r.spendMinor === null && r.metaLeads === null)).toBe(true);
  });

  it('расход и лиды Meta — из insights по объявлению', () => {
    const m = buildMetrics(
      [],
      [
        {
          adId: '1',
          day: '2026-11-10',
          spendMinor: 1234,
          currency: 'USD',
          actions: [
            { action_type: 'onsite_conversion.lead_grouped', value: '3' },
            { action_type: 'link_click', value: '40' },
          ],
        },
      ],
    );
    expect(m).toEqual([
      expect.objectContaining({
        channel: 'ad',
        adKey: '1',
        spendMinor: 1234,
        metaLeads: 3,
        leads: 0,
      }),
    ]);
  });
});
