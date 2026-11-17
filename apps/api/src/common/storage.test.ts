import { describe, expect, it } from 'vitest';
import { Storage } from './storage';

const BASE = 'https://proj.supabase.co';

describe('Storage.signedUrls', () => {
  it('подписывает все файлы одним запросом и собирает полные ссылки', async () => {
    const calls: { url: string; body: unknown }[] = [];
    const fetchFn = (async (url: URL, init: RequestInit) => {
      calls.push({ url: url.toString(), body: JSON.parse(String(init.body)) });
      return new Response(
        JSON.stringify([
          { path: 'w/a.png', signedURL: '/object/sign/reports/w/a.png?token=1', error: null },
          { path: 'w/b.png', signedURL: null, error: 'Not found' },
        ]),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const urls = await new Storage(BASE, 'sb_secret_x', fetchFn).signedUrls(
      'reports',
      ['w/a.png', 'w/b.png', 'w/a.png'],
      600,
    );
    expect(calls).toEqual([
      {
        url: `${BASE}/storage/v1/object/sign/reports`,
        body: { expiresIn: 600, paths: ['w/a.png', 'w/b.png'] },
      },
    ]);
    // Неподписанный файл в ответе отсутствует — вызывающий покажет «нет картинки».
    expect([...urls]).toEqual([
      ['w/a.png', `${BASE}/storage/v1/object/sign/reports/w/a.png?token=1`],
    ]);
  });

  it('без файлов не ходит в Storage, ошибку Storage отдаёт исключением', async () => {
    let called = 0;
    const ok = (async () => {
      called++;
      return new Response('[]');
    }) as unknown as typeof fetch;
    expect((await new Storage(BASE, 'k', ok).signedUrls('reports', [])).size).toBe(0);
    expect(called).toBe(0);

    const fail = (async () =>
      new Response('{"error":"x"}', { status: 400 })) as unknown as typeof fetch;
    await expect(new Storage(BASE, 'k', fail).signedUrls('reports', ['a'])).rejects.toThrow(
      'Storage',
    );
  });
});
