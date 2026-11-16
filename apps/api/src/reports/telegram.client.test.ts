import { describe, expect, it } from 'vitest';
import { TelegramClient } from './telegram.client';

describe('TelegramClient', () => {
  it('JSON-запрос и разбор ответа', async () => {
    const calls: { url: string; type: string; body: string }[] = [];
    const tg = new TelegramClient('123:abc', async (url, body, type) => {
      calls.push({ url, type, body: body.toString() });
      return {
        status: 200,
        text: JSON.stringify({ ok: true, result: { username: 'lidforce_bot' } }),
      };
    });
    await expect(tg.getMe()).resolves.toEqual({ username: 'lidforce_bot' });
    expect(calls[0]!.type).toBe('application/json');
  });
  it('фото уходит multipart с boundary', async () => {
    let type = '';
    let size = 0;
    const tg = new TelegramClient('123:abc', async (_u, body, t) => {
      type = t;
      size = body.length;
      return { status: 200, text: '{"ok":true,"result":{}}' };
    });
    await tg.sendPhoto('-100', new Uint8Array([137, 80, 78, 71]).buffer, 'подпись', '5');
    expect(type).toMatch(/^multipart\/form-data; boundary=/);
    expect(size).toBeGreaterThan(100);
  });
  it('ошибка Telegram и обрыв сети — понятные ошибки', async () => {
    const denied = new TelegramClient('x', async () => ({
      status: 403,
      text: '{"ok":false,"description":"Forbidden: bot was kicked"}',
    }));
    await expect(denied.sendMessage('-1', 'x')).rejects.toMatchObject({ status: 403 });
    await expect(denied.sendMessage('-1', 'x')).rejects.toThrow(
      'Telegram sendMessage: Forbidden: bot was kicked',
    );
    const down = new TelegramClient('x', async () => {
      throw new Error('нет ответа за 15 с');
    });
    await expect(down.getMe()).rejects.toMatchObject({ status: 504 });
  });
});
