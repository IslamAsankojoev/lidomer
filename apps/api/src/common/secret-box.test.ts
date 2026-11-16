import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { maskSecret, SecretBox } from './secret-box';

const key = () => randomBytes(32).toString('base64');

describe('SecretBox', () => {
  it('шифрует и расшифровывает, шифротекст не содержит секрета', () => {
    const box = new SecretBox(key());
    const sealed = box.seal({ apiKey: 'wdr_secret_value' });
    expect(sealed).not.toContain('wdr_secret_value');
    expect(box.open(sealed)).toEqual({ apiKey: 'wdr_secret_value' });
  });
  it('каждый раз новый iv', () => {
    const box = new SecretBox(key());
    expect(box.seal('x')).not.toBe(box.seal('x'));
  });
  it('чужой ключ или подмена данных — ошибка', () => {
    const sealed = new SecretBox(key()).seal('x');
    expect(() => new SecretBox(key()).open(sealed)).toThrow();
    const box = new SecretBox(key());
    const [v, iv, tag, data] = box.seal('secret').split('.');
    const tampered = [v, iv, tag, Buffer.from('xxxx').toString('base64url') + data!.slice(6)].join(
      '.',
    );
    expect(() => box.open(tampered)).toThrow();
  });
  it('маска', () => {
    expect(maskSecret('wdr_abcdefghij1234')).toBe('wdr_…1234');
  });
});
