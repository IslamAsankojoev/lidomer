import { createHmac, timingSafeEqual } from 'node:crypto';

const hmac = (secret: string, data: string) =>
  createHmac('sha256', secret).update(data).digest('hex');

/** Подпись ссылки на снимок отчёта: web получает цифры, не зная секретов. */
export function signRun(secret: string, runId: string, ttlSec = 600, now = Date.now()) {
  const exp = Math.floor(now / 1000) + ttlSec;
  return { exp, sig: hmac(secret, `run:${runId}:${exp}`) };
}

export function verifyRun(
  secret: string,
  runId: string,
  exp: number,
  sig: string,
  now = Date.now(),
): boolean {
  if (!Number.isFinite(exp) || exp * 1000 < now) return false;
  const expected = Buffer.from(hmac(secret, `run:${runId}:${exp}`));
  const got = Buffer.from(sig);
  return expected.length === got.length && timingSafeEqual(expected, got);
}

/** Секрет вебхука Telegram — производный от CRON_SECRET, без отдельной переменной. */
export const telegramWebhookSecret = (cronSecret: string) =>
  hmac(cronSecret, 'telegram-webhook').slice(0, 48);

/** Код привязки группы к компании: «/connect КОД». Свой у каждой компании, не хранится. */
export const connectCode = (cronSecret: string, workspaceId: string) =>
  hmac(cronSecret, `connect:${workspaceId}`).slice(0, 8).toUpperCase();
