import { describe, expect, it } from 'vitest';
import { RateLimiter } from '../../common/http';
import {
  createB24Adapter,
  detectFormFields,
  mapDeal,
  pickDealStages,
  toMinor,
} from './b24.adapter';
import { B24Client, b24WebhookUrlSchema } from './b24.client';

const noWait = async () => {};
const limiter = () => new RateLimiter(1000, 1000, Date.now, noWait);
const HOOK = 'https://portal.bitrix24.kz/rest/1/abcdef123456/';

function fakeFetch(
  handler: (method: string, body: Record<string, unknown>) => { status: number; body: unknown },
) {
  const calls: { method: string; body: Record<string, unknown> }[] = [];
  const fn = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const method = String(input).replace(HOOK, '').replace('.json', '');
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    calls.push({ method, body });
    const r = handler(method, body);
    return new Response(JSON.stringify(r.body), { status: r.status });
  }) as typeof fetch;
  return { fn, calls };
}

describe('вебхук Bitrix24', () => {
  it('принимает адрес портала и дописывает слеш', () => {
    expect(b24WebhookUrlSchema.parse(' https://alatoo.bitrix24.kz/rest/12/q1w2e3r4 ')).toBe(
      'https://alatoo.bitrix24.kz/rest/12/q1w2e3r4/',
    );
  });
  it('отклоняет чужие адреса и http', () => {
    for (const bad of [
      'http://alatoo.bitrix24.kz/rest/1/abc/',
      'https://evil.com/rest/1/abc/',
      'https://alatoo.bitrix24.kz/',
    ]) {
      expect(b24WebhookUrlSchema.safeParse(bad).success).toBe(false);
    }
  });
  it('маска не раскрывает код вебхука', () => {
    const masked = createB24Adapter().mask({ webhookUrl: HOOK });
    expect(masked.webhookUrl).toBe('https://portal.bitrix24.kz/rest/1/ab…/');
  });
});

describe('сделки', () => {
  it('сумма — в минимальных единицах, пустая сумма — null', () => {
    expect(toMinor('15000.50', 'USD')).toBe(1500050);
    expect(toMinor('500', 'KZT')).toBe(50000);
    expect(toMinor('', 'USD')).toBeNull();
    expect(toMinor('100', null)).toBeNull();
  });
  it('поля сделки переносятся с UTM и датами', () => {
    const d = mapDeal('ws', {
      ID: '14605',
      STAGE_ID: 'C1:WON',
      CATEGORY_ID: '1',
      OPPORTUNITY: '90000',
      CURRENCY_ID: 'USD',
      UTM_SOURCE: 'facebook',
      DATE_MODIFY: '2026-11-10T13:45:00+06:00',
    });
    expect(d).toMatchObject({
      id: '14605',
      categoryId: 1,
      amountMinor: 9000000,
      utmSource: 'facebook',
    });
    expect(d.updatedAt?.toISOString()).toBe('2026-11-10T07:45:00.000Z');
  });
});

describe('B24Client', () => {
  it('неверный вебхук — ошибка доступа без повторов', async () => {
    const { fn, calls } = fakeFetch(() => ({
      status: 401,
      body: { error: 'NO_AUTH_FOUND', error_description: 'Wrong authorization data' },
    }));
    const c = new B24Client(HOOK, { fetchFn: fn, limiter: limiter(), sleepFn: noWait });
    await expect(c.call('crm.deal.list', {})).rejects.toMatchObject({ status: 401 });
    expect(calls).toHaveLength(1);
  });
  it('превышение лимита — повтор', async () => {
    let n = 0;
    const { fn, calls } = fakeFetch(() =>
      ++n === 1
        ? { status: 503, body: { error: 'QUERY_LIMIT_EXCEEDED' } }
        : { status: 200, body: { result: [] } },
    );
    const c = new B24Client(HOOK, { fetchFn: fn, limiter: limiter(), sleepFn: noWait });
    await expect(c.call('crm.deal.list', {})).resolves.toEqual({ result: [] });
    expect(calls).toHaveLength(2);
  });
  it('в raw пишется метод, но не адрес вебхука', async () => {
    const raw: unknown[] = [];
    const { fn } = fakeFetch(() => ({ status: 200, body: { result: [] } }));
    const c = new B24Client(HOOK, {
      fetchFn: fn,
      limiter: limiter(),
      onResponse: async (e) => void raw.push(e),
    });
    await c.call('crm.deal.list', { start: -1 });
    expect(JSON.stringify(raw)).not.toContain('abcdef123456');
  });
});

describe('расписание и выгрузка Bitrix24', () => {
  it('ночью — стадии и все сделки, затем раз в час — изменённые', () => {
    const a = createB24Adapter();
    const now = new Date('2026-11-16T20:00:00Z');
    const first = a.dueJobs({}, now, 'Asia/Bishkek');
    expect(first.jobs.map((j) => j.kind)).toEqual(['b24:stages', 'b24:deals']);
    const hour = a.dueJobs(first.state, new Date(now.getTime() + 61 * 60_000), 'Asia/Bishkek');
    expect(hour.jobs).toEqual([
      { kind: 'b24:deals', params: { afterId: '0', since: '2026-11-16T19:00:00.000Z' } },
    ]);
  });

  it('листает по ID страницами по 50 и upsert-ит', async () => {
    const deals = Array.from({ length: 73 }, (_, i) => ({
      ID: String(i + 1),
      TITLE: `Сделка ${i + 1}`,
    }));
    const { fn, calls } = fakeFetch((m, body) => {
      if (m === 'crm.deal.fields') return { status: 200, body: { result: {} } };
      const after = Number((body.filter as Record<string, string>)['>ID']);
      return {
        status: 200,
        body: { result: deals.filter((d) => Number(d.ID) > after).slice(0, 50) },
      };
    });
    const inserted: number[] = [];
    const db = {
      insert: () => ({
        values: (rows: unknown[]) => ({
          onConflictDoUpdate: async () => void inserted.push(rows.length),
        }),
      }),
    };
    const a = createB24Adapter({ fetchFn: fn, limiter: limiter() });
    const res = await a.run(
      { kind: 'b24:deals', params: { afterId: '0' } },
      { webhookUrl: HOOK },
      {
        db: db as never,
        workspaceId: 'ws',
        integrationId: 'i',
        timezone: 'Asia/Bishkek',
        recordRaw: async () => {},
        deadline: Date.now() + 60_000,
        now: new Date(),
      },
    );
    expect(res).toEqual({ records: 73 });
    expect(inserted).toEqual([50, 23]);
    expect(
      calls
        .filter((c) => c.method === 'crm.deal.list')
        .map((c) => (c.body.filter as Record<string, string>)['>ID']),
    ).toEqual(['0', '50']);
  });
});

describe('стадии сделок', () => {
  it('берёт только DEAL_STAGE*, направление — из ENTITY_ID, без повторов', () => {
    // Так отвечает реальный портал: фильтр по ENTITY_ID игнорируется, приходят все справочники.
    const items = [
      { STATUS_ID: 'NEW', ENTITY_ID: 'STATUS', CATEGORY_ID: '0' },
      { STATUS_ID: 'NEW', ENTITY_ID: 'DEAL_STAGE', CATEGORY_ID: '0' },
      { STATUS_ID: 'WON', ENTITY_ID: 'DEAL_STAGE', CATEGORY_ID: '0' },
      { STATUS_ID: 'C1:NEW', ENTITY_ID: 'DEAL_STAGE_1', CATEGORY_ID: '0' },
      { STATUS_ID: 'OTHER', ENTITY_ID: 'SOURCE', CATEGORY_ID: '0' },
      { STATUS_ID: 'NEW', ENTITY_ID: 'DEAL_STATE', CATEGORY_ID: '0' },
      { STATUS_ID: 'DT7_1:NEW', ENTITY_ID: 'SMART_B2E_DOC_STAGE_7', CATEGORY_ID: '0' },
    ];
    expect(pickDealStages(items).map((s) => [s.STATUS_ID, s.categoryId])).toEqual([
      ['NEW', 0],
      ['WON', 0],
      ['C1:NEW', 1],
    ]);
  });
});

describe('телефон лид-формы в пользовательских полях', () => {
  it('находит поля по подписи, а не по коду', () => {
    const f = detectFormFields({
      UF_CRM_1: { type: 'string', formLabel: 'ТЕЛЕФОН' },
      UF_CRM_2: { type: 'string', listLabel: 'номер' },
      UF_CRM_3: { type: 'string', formLabel: 'ИМЯ' },
      UF_CRM_4: { type: 'string', formLabel: 'Бюджет' },
      UF_CRM_5: { type: 'enumeration', formLabel: 'Телефон оператора' },
      TITLE: { type: 'string', formLabel: 'Название' },
    });
    expect(f).toEqual({ phone: ['UF_CRM_1', 'UF_CRM_2'], name: ['UF_CRM_3'] });
  });
  it('берёт первый телефон, который похож на телефон', () => {
    const d = mapDeal(
      'ws',
      { ID: '1', UF_CRM_1: 'нет', UF_CRM_2: '0555 12-34-56', UF_CRM_3: 'Айгуль' } as never,
      { phone: ['UF_CRM_1', 'UF_CRM_2'], name: ['UF_CRM_3'] },
    );
    expect(d).toMatchObject({ phone: '+996555123456', clientName: 'Айгуль' });
  });
});
