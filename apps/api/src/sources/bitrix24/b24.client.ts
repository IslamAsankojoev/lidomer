import { z } from 'zod';
import { HttpError, RateLimiter, withRetry } from '../../common/http';
import type { RawRecorder } from '../types';

/**
 * Адрес входящего вебхука: https://<портал>/rest/<id пользователя>/<код>/
 * Это секрет: в логи и raw_payloads пишется только имя метода.
 */
export const b24WebhookUrlSchema = z
  .string()
  .trim()
  .transform((v) => (v.endsWith('/') ? v : `${v}/`))
  .pipe(
    z
      .string()
      .regex(
        /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.bitrix24\.[a-z]{2,}\/rest\/\d+\/[A-Za-z0-9]+\/$/,
        'Адрес вебхука вида https://портал.bitrix24.kz/rest/1/код/',
      ),
  );

const bitrixErrorSchema = z.looseObject({
  error: z.string(),
  error_description: z.string().optional(),
});

export interface B24ClientOptions {
  fetchFn?: typeof fetch;
  limiter?: RateLimiter;
  onResponse?: RawRecorder;
  sleepFn?: (ms: number) => Promise<void>;
}

/** Клиент входящего вебхука Bitrix24: только чтение, не больше 2 запросов в секунду. */
export class B24Client {
  private readonly fetchFn: typeof fetch;
  private readonly limiter: RateLimiter;

  constructor(
    private readonly webhookUrl: string,
    private readonly opts: B24ClientOptions = {},
  ) {
    this.fetchFn = opts.fetchFn ?? fetch;
    this.limiter = opts.limiter ?? new RateLimiter(2, 1000);
  }

  /** Портал без секретной части — для карточки интеграции. */
  get portal(): string {
    return new URL(this.webhookUrl).host;
  }

  async call(method: string, params: Record<string, unknown>): Promise<unknown> {
    return withRetry(
      async () => {
        await this.limiter.take();
        const res = await this.fetchFn(`${this.webhookUrl}${method}.json`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        });
        const body: unknown = await res.json().catch(() => null);
        await this.opts.onResponse?.({
          endpoint: method,
          request: params,
          httpStatus: res.status,
          response: body,
        });
        const err = bitrixErrorSchema.safeParse(body);
        if (!res.ok || err.success) {
          const code = err.success ? err.data.error : `HTTP ${res.status}`;
          const text =
            err.success && err.data.error_description ? `: ${err.data.error_description}` : '';
          // Неверный вебхук или нет прав — как 401, повторять бессмысленно.
          const status =
            /NO_AUTH_FOUND|INVALID_CREDENTIALS|insufficient_scope|ACCESS_DENIED|expired_token/i.test(
              code,
            )
              ? 401
              : code === 'QUERY_LIMIT_EXCEEDED'
                ? 429
                : res.status >= 400
                  ? res.status
                  : 400;
          throw new HttpError(status, `Bitrix24 ${method}: ${code}${text}`, body);
        }
        return body;
      },
      { sleepFn: this.opts.sleepFn, minDelayMs: 1000 },
    );
  }
}
