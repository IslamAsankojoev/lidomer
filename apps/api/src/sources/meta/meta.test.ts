import { describe, expect, it } from 'vitest';
import { createMetaAdapter, spendToMinor, weekChunks } from './meta.adapter';
import { exchangeLoginCode, MetaClient, usagePercent } from './meta.client';
import { z } from 'zod';

const TOKEN = 'EAAtesttoken_should_never_leak_123';
const noWait = async () => {};

function fakeFetch(
  handler: (url: URL) => { status: number; body: unknown; headers?: Record<string, string> },
) {
  const calls: { url: URL; auth: string | null }[] = [];
  const fn = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url, auth: new Headers(init?.headers).get('authorization') });
    const r = handler(url);
    return new Response(JSON.stringify(r.body), { status: r.status, headers: r.headers });
  }) as typeof fetch;
  return { fn, calls };
}

describe('Meta: вспомогательное', () => {
  it('расход в центах', () => {
    expect(spendToMinor('12.34', 'USD')).toBe(1234);
    expect(spendToMinor(null, 'USD')).toBe(0);
  });
  it('периоды по 7 дней', () => {
    expect(weekChunks('2026-11-01', '2026-11-16')).toEqual([
      { from: '2026-11-01', to: '2026-11-07' },
      { from: '2026-11-08', to: '2026-11-14' },
      { from: '2026-11-15', to: '2026-11-16' },
    ]);
  });
  it('процент лимита — максимум из заголовков', () => {
    const h = new Headers({
      'x-business-use-case-usage': JSON.stringify({
        '123': [{ call_count: 12, total_cputime: 80, total_time: 3 }],
      }),
      'x-ad-account-usage': JSON.stringify({ acc_id_util_pct: 40 }),
    });
    expect(usagePercent(h)).toBe(80);
  });
});

describe('MetaClient', () => {
  it('листает paging.next, токен — только в заголовке и не попадает в raw', async () => {
    const raw: unknown[] = [];
    const { fn, calls } = fakeFetch((url) =>
      url.searchParams.get('after')
        ? { status: 200, body: { data: [{ id: '2' }] } }
        : {
            status: 200,
            body: {
              data: [{ id: '1' }],
              paging: {
                next: `https://graph.facebook.com/v27.0/act_1/ads?after=x&access_token=${TOKEN}`,
              },
            },
          },
    );
    const c = new MetaClient(TOKEN, { fetchFn: fn, onResponse: async (e) => void raw.push(e) });
    const items = await c.getAll('/act_1/ads', z.object({ id: z.string() }), { fields: 'id' });
    expect(items.map((i) => i.id)).toEqual(['1', '2']);
    expect(calls.every((c) => !c.url.searchParams.has('access_token'))).toBe(true);
    expect(calls[0]!.auth).toBe(`Bearer ${TOKEN}`);
    expect(JSON.stringify(raw)).not.toContain(TOKEN);
  });

  it('отозванный токен — 401, лимит — 429 с повтором', async () => {
    const revoked = fakeFetch(() => ({
      status: 400,
      body: { error: { message: 'Session expired', code: 190 } },
    }));
    await expect(
      new MetaClient(TOKEN, { fetchFn: revoked.fn, sleepFn: noWait }).get('/me'),
    ).rejects.toMatchObject({
      status: 401,
    });
    expect(revoked.calls).toHaveLength(1);

    let n = 0;
    const limited = fakeFetch(() =>
      ++n === 1
        ? { status: 400, body: { error: { message: 'User request limit reached', code: 17 } } }
        : { status: 200, body: { id: 'me' } },
    );
    await expect(
      new MetaClient(TOKEN, { fetchFn: limited.fn, sleepFn: noWait }).get('/me'),
    ).resolves.toEqual({
      id: 'me',
    });
  });

  it('код входа обменивается с пустым redirect_uri', async () => {
    const { fn, calls } = fakeFetch(() => ({ status: 200, body: { access_token: TOKEN } }));
    await expect(exchangeLoginCode('code123', 'app', 'secret', fn)).resolves.toBe(TOKEN);
    expect(calls[0]!.url.searchParams.get('redirect_uri')).toBe('');
  });
});

describe('Meta: подключение', () => {
  it('предупреждает, если пояс аккаунта не Asia/Bishkek', async () => {
    const { fn } = fakeFetch(() => ({
      status: 200,
      body: {
        data: [
          {
            id: 'act_1',
            name: 'Основной',
            currency: 'USD',
            timezone_name: 'Asia/Bishkek',
            account_status: 1,
          },
          {
            id: 'act_2',
            name: 'Старый',
            currency: 'USD',
            timezone_name: 'America/Los_Angeles',
            account_status: 1,
          },
        ],
      },
    }));
    const res = await createMetaAdapter({ clientOpts: { fetchFn: fn } }).test({
      accessToken: TOKEN,
    });
    expect(res.warnings).toHaveLength(1);
    expect(res.warnings[0]).toContain('America/Los_Angeles');
  });

  it('без рекламных аккаунтов — ошибка доступа', async () => {
    const { fn } = fakeFetch(() => ({ status: 200, body: { data: [] } }));
    await expect(
      createMetaAdapter({ clientOpts: { fetchFn: fn } }).test({ accessToken: TOKEN }),
    ).rejects.toMatchObject({
      status: 403,
    });
  });

  it('при подключении — структура и 90 дней кусками по 7', () => {
    const jobs = createMetaAdapter().initialJobs(new Date('2026-11-16T10:00:00Z'), 'Asia/Bishkek');
    expect(jobs[0]).toEqual({ kind: 'meta:structure', params: {} });
    expect(jobs.slice(1).every((j) => j.kind === 'meta:insights')).toBe(true);
    expect(jobs).toHaveLength(1 + 13);
  });
});
