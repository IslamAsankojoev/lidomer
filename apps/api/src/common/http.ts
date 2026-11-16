/**
 * Тонкий HTTP-слой для клиентов внешних API: повторы с паузой и ограничение частоты.
 * Свой, а не p-retry/p-limit: те выходят только как ES-модули, а api собран в CommonJS.
 */

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body: unknown = null,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface RetryOptions {
  retries?: number;
  /** Пауза перед первой повторной попыткой, дальше удваивается. */
  minDelayMs?: number;
  /** Повторять ли эту ошибку. По умолчанию — сеть, 429 и 5xx. */
  shouldRetry?: (err: unknown) => boolean;
  sleepFn?: (ms: number) => Promise<void>;
}

export function isTransient(err: unknown): boolean {
  if (err instanceof HttpError) return err.status === 429 || err.status >= 500;
  return err instanceof TypeError; // fetch: сеть недоступна
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const { retries = 3, minDelayMs = 1000, shouldRetry = isTransient, sleepFn = sleep } = opts;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= retries || !shouldRetry(err)) throw err;
      await sleepFn(minDelayMs * 2 ** attempt);
    }
  }
}

/**
 * Не больше `limit` запросов за `intervalMs` (скользящее окно). Внутри одного вызова функции —
 * этого достаточно: между вызовами лимит соблюдает размер порции задач.
 */
export class RateLimiter {
  private readonly stamps: number[] = [];

  constructor(
    private readonly limit: number,
    private readonly intervalMs: number,
    private readonly now: () => number = Date.now,
    private readonly sleepFn: (ms: number) => Promise<void> = sleep,
  ) {}

  async take(): Promise<void> {
    for (;;) {
      const t = this.now();
      while (this.stamps.length && t - this.stamps[0]! >= this.intervalMs) this.stamps.shift();
      if (this.stamps.length < this.limit) {
        this.stamps.push(t);
        return;
      }
      await this.sleepFn(this.intervalMs - (t - this.stamps[0]!));
    }
  }
}
