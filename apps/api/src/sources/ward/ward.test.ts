import { describe, expect, it } from 'vitest';
import { RateLimiter } from '../../common/http';
import { parseWardSource } from './parse-source';
import { createWardAdapter } from './ward.adapter';
import { WardClient, wardLeadSchema } from './ward.client';

// Обезличенные ответы в формате документации Ward (данные выдуманы для тестов).
const lead = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  created_at: '2026-11-10T08:32:10.000Z',
  updated_at: '2026-11-10T08:43:55.000Z',
  name: 'Тест',
  phone: '+996000000000',
  instagram: '@test',
  request: null,
  source: 'Instagram, комментарий · пост «…»',
  status: 'new',
  amount: null,
  crm: { system: 'bitrix24', entity: 'deal', id: '14605' },
  ad: null,
  post_id: '17960443407216191',
  facts: { rooms: '2' },
  ...extra,
});

const noWait = async () => {};
const limiter = () => new RateLimiter(1000, 60_000, Date.now, noWait);

function fakeFetch(handler: (url: URL) => { status: number; body: unknown }) {
  const calls: URL[] = [];
  const fn = (async (input: URL | RequestInfo) => {
    const url = new URL(String(input));
    calls.push(url);
    const { status, body } = handler(url);
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return { fn, calls };
}

describe('parseWardSource', () => {
  it('поле ad — главное', () => {
    expect(
      parseWardSource({
        ad: { id: '1202', title: 'x' },
        source: 'Instagram Direct',
        post_id: null,
      }),
    ).toEqual({
      kind: 'ad',
      adId: '1202',
      postId: null,
    });
  });
  it('«реклама #id» в тексте → объявление', () => {
    expect(
      parseWardSource({ ad: null, source: 'Instagram, реклама #120212345678', post_id: null }).kind,
    ).toBe('ad');
  });
  it('комментарий под постом → пост', () => {
    expect(
      parseWardSource({ ad: null, source: 'Instagram, комментарий · пост «…»', post_id: '1796' }),
    ).toEqual({
      kind: 'post',
      adId: null,
      postId: '1796',
    });
  });
  it('Instagram Direct без метки → direct', () => {
    expect(parseWardSource({ ad: null, source: 'Instagram Direct', post_id: null }).kind).toBe(
      'direct',
    );
  });
  it('непонятный источник не угадывается', () => {
    expect(parseWardSource({ ad: null, source: 'WhatsApp', post_id: null }).kind).toBe('unknown');
  });
});

describe('WardClient', () => {
  it('забирает все страницы по 500 и пишет каждый ответ в raw', async () => {
    const all = Array.from({ length: 501 }, (_, i) => lead(i + 1));
    const { fn, calls } = fakeFetch((url) => {
      const offset = Number(url.searchParams.get('offset'));
      return { status: 200, body: { data: all.slice(offset, offset + 500), limit: 500, offset } };
    });
    const raw: unknown[] = [];
    const client = new WardClient('wdr_testkey123', {
      fetchFn: fn,
      limiter: limiter(),
      onResponse: async (e) => void raw.push(e),
    });
    const leads = await client.listAll('/leads', wardLeadSchema, '2026-11-10', '2026-11-10');
    expect(leads).toHaveLength(501);
    expect(calls.map((c) => c.searchParams.get('offset'))).toEqual(['0', '500']);
    expect(raw).toHaveLength(2);
    expect(JSON.stringify(raw)).not.toContain('wdr_testkey123');
  });

  it('на 429 ждёт и повторяет, на 401 — сразу ошибка', async () => {
    let n = 0;
    const flaky = fakeFetch(() =>
      ++n === 1
        ? { status: 429, body: { error: 'too many' } }
        : { status: 200, body: { data: [], limit: 500, offset: 0 } },
    );
    const ok = new WardClient('wdr_testkey123', {
      fetchFn: flaky.fn,
      limiter: limiter(),
      sleepFn: noWait,
    });
    await expect(ok.listAll('/leads', wardLeadSchema, '2026-11-10', '2026-11-10')).resolves.toEqual(
      [],
    );
    expect(flaky.calls).toHaveLength(2);

    const denied = fakeFetch(() => ({ status: 401, body: { error: 'ключ неверный' } }));
    const bad = new WardClient('wdr_testkey123', {
      fetchFn: denied.fn,
      limiter: limiter(),
      sleepFn: noWait,
    });
    await expect(bad.listAll('/leads', wardLeadSchema, '2026-11-10', '2026-11-10')).rejects.toThrow(
      'ключ неверный',
    );
    expect(denied.calls).toHaveLength(1);
  });
});

describe('расписание Ward', () => {
  const adapter = createWardAdapter();
  const now = new Date('2026-11-16T19:30:00Z');

  it('при подключении — история за 30 дней по дням UTC', () => {
    const jobs = adapter.initialJobs(now, 'Asia/Bishkek');
    expect(jobs).toHaveLength(31);
    expect(jobs[0]).toEqual({ kind: 'ward:day', params: { day: '2026-11-16' } });
  });

  it('ночная — 30 дней, затем каждые 15 минут — 2 дня', () => {
    const first = adapter.dueJobs({}, now, 'Asia/Bishkek');
    expect(first.jobs).toHaveLength(31);
    const soon = adapter.dueJobs(first.state, new Date(now.getTime() + 5 * 60_000), 'Asia/Bishkek');
    expect(soon.jobs).toHaveLength(0);
    const later = adapter.dueJobs(
      first.state,
      new Date(now.getTime() + 16 * 60_000),
      'Asia/Bishkek',
    );
    expect(later.jobs.map((j) => j.params.day)).toEqual(['2026-11-16', '2026-11-15', '2026-11-14']);
  });

  it('ключ проверяется по формату', () => {
    expect(adapter.secretsSchema.safeParse({ apiKey: 'abc' }).success).toBe(false);
    expect(adapter.secretsSchema.safeParse({ apiKey: ' wdr_abcdefgh12 ' }).success).toBe(true);
  });
});
