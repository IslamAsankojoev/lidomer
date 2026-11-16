import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 'v1';

/**
 * Шифрование секретов интеграций AES-256-GCM. Формат: `v1.<iv>.<tag>.<данные>` (base64url).
 * Ключ — 32 байта из ENCRYPTION_KEY. Подмена данных или чужой ключ → ошибка, а не мусор.
 */
export class SecretBox {
  private readonly key: Buffer;

  constructor(keyBase64: string) {
    this.key = Buffer.from(keyBase64, 'base64');
    if (this.key.length !== 32) throw new Error('ENCRYPTION_KEY: нужно 32 байта');
  }

  seal(value: unknown): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [VERSION, iv, tag, data]
      .map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
      .join('.');
  }

  open(sealed: string): unknown {
    const [version, iv, tag, data] = sealed.split('.');
    if (version !== VERSION || !iv || !tag || !data) throw new Error('Неизвестный формат секрета');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(data, 'base64url')),
      decipher.final(),
    ]);
    return JSON.parse(plain.toString('utf8')) as unknown;
  }
}

/** «wdr_…a1b2» — ключ после сохранения показывается только маской. */
export function maskSecret(value: string): string {
  if (value.length <= 8) return '••••';
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}
