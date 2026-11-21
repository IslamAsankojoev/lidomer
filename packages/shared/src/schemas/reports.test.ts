import { describe, expect, it } from 'vitest';
import { deliverySchema, greenApiHostSchema, recipientSchema } from './reports';

describe('хост Green API', () => {
  it('пропускает адреса из консоли', () => {
    for (const ok of [
      'https://1234.api.greenapi.com',
      'https://api.green-api.com',
      'https://media.green-api.com/',
    ])
      expect(greenApiHostSchema.safeParse(ok).success, ok).toBe(true);
    expect(greenApiHostSchema.parse('https://media.green-api.com/')).toBe(
      'https://media.green-api.com',
    );
  });
  it('не пускает чужие и опасные адреса', () => {
    for (const bad of [
      'http://api.green-api.com',
      'https://evil.com',
      'https://green-api.com.evil.com',
      'https://user@api.green-api.com',
      'https://api.green-api.com:8443',
      'https://api.green-api.com/x',
      'https://api.green-api.com?x=1',
      'https://api.green-api.com#x',
      'api.green-api.com',
    ])
      expect(greenApiHostSchema.safeParse(bad).success, bad).toBe(false);
  });
});

describe('получатели', () => {
  it('без канала — Telegram (старые записи)', () => {
    expect(recipientSchema.parse({ chatId: '-100', threadId: null }).channel).toBe('telegram');
    expect(
      deliverySchema.parse({ chatId: '-1', threadId: null, ok: true, error: null }).channel,
    ).toBe('telegram');
  });
  it('у WhatsApp нет тем', () => {
    expect(
      recipientSchema.safeParse({ channel: 'green_api', chatId: '1@g.us', threadId: '5' }).success,
    ).toBe(false);
    expect(
      recipientSchema.safeParse({ channel: 'green_api', chatId: '1@g.us', threadId: null }).success,
    ).toBe(true);
  });
});
