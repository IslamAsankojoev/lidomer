import { describe, expect, it } from 'vitest';
import type { Ipv4Request } from '../common/ipv4-request';
import { GreenApiClient } from './green-api.client';

// Фейковые ключи для тестов.
const KEYS = {
  apiUrl: 'https://1101.api.greenapi.com',
  mediaUrl: 'https://1101.media.greenapi.com/',
  idInstance: '1101000001',
  apiTokenInstance: 'secret-token-0123456789abcdef',
};

const client = (reply: (r: Ipv4Request) => { status: number; text: string }) => {
  const calls: Ipv4Request[] = [];
  const c = new GreenApiClient(KEYS, async (r) => {
    calls.push(r);
    return reply(r);
  });
  return { c, calls };
};

describe('GreenApiClient', () => {
  it('методы — на apiUrl, файл — на mediaUrl', async () => {
    const { c, calls } = client((r) =>
      r.url.includes('sendFileByUpload')
        ? { status: 200, text: '{"idMessage":"ABC","urlFile":"x"}' }
        : { status: 200, text: '{"stateInstance":"authorized"}' },
    );
    await expect(c.getState()).resolves.toBe('authorized');
    await expect(
      c.sendFile('1@g.us', new Uint8Array([1, 2, 3]), 'report.png', '📊 Итоги дня'),
    ).resolves.toEqual({ idMessage: 'ABC' });
    expect(calls[0]).toMatchObject({ method: 'GET' });
    expect(calls[0]!.url).toBe(
      `https://1101.api.greenapi.com/waInstance1101000001/getStateInstance/${KEYS.apiTokenInstance}`,
    );
    expect(
      calls[1]!.url.startsWith(
        'https://1101.media.greenapi.com/waInstance1101000001/sendFileByUpload/',
      ),
    ).toBe(true);
    expect(calls[1]!.contentType).toMatch(/^multipart\/form-data; boundary=/);
    const body = calls[1]!.body!.toString('utf8');
    for (const field of [
      'name="chatId"',
      'name="fileName"',
      'name="caption"',
      'report.png',
      '📊 Итоги дня',
    ])
      expect(body).toContain(field);
  });

  it('группы: только @g.us, запасные имена; запрос с group=true', async () => {
    const { c, calls } = client(() => ({
      status: 200,
      text: JSON.stringify([
        { id: '1@g.us', name: 'Отчёты', type: 'group' },
        { id: '2@g.us', name: '', contactName: 'Маркетинг', type: 'group' },
        { id: '3@g.us', type: 'group' },
        { id: '79001234567@c.us', name: 'Клиент', type: 'user' },
      ]),
    }));
    await expect(c.getGroups()).resolves.toEqual([
      { id: '1@g.us', name: 'Отчёты' },
      { id: '2@g.us', name: 'Маркетинг' },
      { id: '3@g.us', name: 'Группа без названия' },
    ]);
    expect(calls[0]!.url.endsWith('?group=true')).toBe(true);
  });

  it('ошибки понятные и без токена', async () => {
    const cases: [number, string][] = [
      [401, 'Green API getStateInstance: неверный токен или инстанс удалён'],
      [
        466,
        'Green API getStateInstance: лимит тарифа Green API (Developer — 3 чата), смените тариф на Business',
      ],
      [429, 'Green API getStateInstance: слишком много запросов'],
    ];
    for (const [status, text] of cases) {
      const { c } = client(() => ({ status, text: `{"message":"${KEYS.apiTokenInstance}"}` }));
      const err = await c.getState().catch((e: Error) => e);
      expect(err).toMatchObject({ status, message: text });
      expect(String((err as Error).message)).not.toContain(KEYS.apiTokenInstance);
    }
    const down = new GreenApiClient(KEYS, async (r) => {
      throw new Error(`connect ECONNREFUSED ${r.url}`);
    });
    const err = (await down.getState().catch((e: Error) => e)) as Error;
    expect(err.message).toBe('Green API getStateInstance: нет ответа за 15 с');
    expect(err.message).not.toContain(KEYS.apiTokenInstance);
  });

  it('чужой хост не принимается', () => {
    expect(() => new GreenApiClient({ ...KEYS, apiUrl: 'https://evil.com' })).toThrow();
  });
});
