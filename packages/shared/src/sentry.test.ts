import { describe, expect, it } from 'vitest';
import { maskPhonesInText, scrubEvent } from './sentry';

describe('maskPhonesInText', () => {
  it('маскирует телефоны в любом написании', () => {
    expect(maskPhonesInText('лид +996 555 12-34-56 без сделки')).toBe('лид [телефон] без сделки');
    expect(maskPhonesInText('phone=996555123456;')).toBe('phone=[телефон];');
    expect(maskPhonesInText('8 (700) 123-45-67')).toBe('[телефон]');
  });

  it('не трогает даты, суммы и короткие номера', () => {
    expect(maskPhonesInText('день 2026-11-17, сделка №16353, 1 468 лидов')).toBe(
      'день 2026-11-17, сделка №16353, 1 468 лидов',
    );
  });
});

describe('scrubEvent', () => {
  it('вырезает тела, query, cookies, авторизацию и всё о пользователе, кроме id', () => {
    const event = scrubEvent({
      message: 'Ошибка для +996700123456',
      exception: { values: [{ value: 'Bitrix24: телефон 0555 123 456 не найден' }] },
      request: {
        url: 'https://api.example.com/leads?search=0555123456',
        data: { phone: '+996555123456', name: 'Иван' },
        query_string: 'search=0555123456',
        cookies: { sb: 'x' },
        headers: { Authorization: 'Bearer t', 'X-Workspace-Id': 'w', 'User-Agent': 'ua' },
      },
      user: { id: 'u1', email: 'a@b.c', ip_address: '1.2.3.4' },
      breadcrumbs: [{ message: 'fetch +996555123456', data: { url: '/leads?phone=1' } }],
      extra: { lead: { phone: '+996555123456' } },
    });
    expect(event).toEqual({
      message: 'Ошибка для [телефон]',
      exception: { values: [{ value: 'Bitrix24: телефон [телефон] не найден' }] },
      request: { url: 'https://api.example.com/leads', headers: { 'User-Agent': 'ua' } },
      user: { id: 'u1' },
      breadcrumbs: [{ message: 'fetch [телефон]', data: undefined }],
    });
  });
});
