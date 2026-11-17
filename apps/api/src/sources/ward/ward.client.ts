import { z } from 'zod';
import { HttpError, RateLimiter, withRetry } from '../../common/http';
import type { RawRecorder } from '../types';

export const WARD_BASE_URL = 'https://web-production-fc140.up.railway.app/api/v1';

const nullableString = z.string().nullish();

export const wardLeadSchema = z.looseObject({
  id: z.number().int(),
  created_at: z.string(),
  updated_at: nullableString,
  name: nullableString,
  phone: nullableString,
  instagram: nullableString,
  request: nullableString,
  source: nullableString,
  status: nullableString,
  amount: z.union([z.number(), z.string()]).nullish(),
  crm: z
    .looseObject({
      system: nullableString,
      entity: nullableString,
      id: z.union([z.string(), z.number()]).nullish(),
    })
    .nullish(),
  ad: z.looseObject({ id: z.union([z.string(), z.number()]), title: nullableString }).nullish(),
  post_id: z.union([z.string(), z.number()]).nullish(),
  facts: z.record(z.string(), z.unknown()).nullish(),
});
export type WardLead = z.infer<typeof wardLeadSchema>;

export const wardConversationSchema = z.looseObject({
  id: z.number().int(),
  created_at: z.string(),
  last_client_message_at: nullableString,
  last_reply_at: nullableString,
  source: z.string(),
  handled_by: nullableString,
  needs_manager: nullableString,
  has_lead: z.boolean(),
  instagram: nullableString,
  ad: z
    .union([z.looseObject({ id: z.union([z.string(), z.number()]) }), z.string(), z.number()])
    .nullish(),
  post_id: z.union([z.string(), z.number()]).nullish(),
  messages_in: z.number().nullish(),
  messages_out: z.number().nullish(),
  facts: z.record(z.string(), z.unknown()).nullish(),
});
export type WardConversation = z.infer<typeof wardConversationSchema>;

const pageSchema = <T extends z.ZodType>(item: T) =>
  z.looseObject({ data: z.array(item), limit: z.number(), offset: z.number() });

const summarySchema = z.looseObject({
  period: z.object({ from: z.string(), to: z.string() }),
  leads: z.looseObject({ total: z.number() }),
});

export const WARD_PAGE_SIZE = 500;

export interface WardClientOptions {
  baseUrl?: string;
  fetchFn?: typeof fetch;
  limiter?: RateLimiter;
  onResponse?: RawRecorder;
  sleepFn?: (ms: number) => Promise<void>;
}

/** Клиент Ward API для отчётов: только GET, Bearer-ключ, не больше 120 запросов в минуту. */
export class WardClient {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly limiter: RateLimiter;

  constructor(
    private readonly apiKey: string,
    private readonly opts: WardClientOptions = {},
  ) {
    this.baseUrl = opts.baseUrl ?? WARD_BASE_URL;
    this.fetchFn = opts.fetchFn ?? fetch;
    this.limiter = opts.limiter ?? new RateLimiter(110, 60_000);
  }

  private async get(path: string, params: Record<string, string | number>): Promise<unknown> {
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    return withRetry(
      async () => {
        await this.limiter.take();
        const res = await this.fetchFn(url, {
          headers: { Authorization: `Bearer ${this.apiKey}` },
        });
        const body: unknown = await res.json().catch(() => null);
        await this.opts.onResponse?.({
          endpoint: path,
          request: params,
          httpStatus: res.status,
          response: body,
        });
        if (!res.ok) {
          const msg =
            body && typeof body === 'object' && 'error' in body
              ? String(body.error)
              : `HTTP ${res.status}`;
          throw new HttpError(res.status, `WARD: ${msg}`, body);
        }
        return body;
      },
      { sleepFn: this.opts.sleepFn, minDelayMs: 2000 },
    );
  }

  async summary(from: string, to: string) {
    return summarySchema.parse(await this.get('/summary', { from, to }));
  }

  /** Все лиды или переписки за даты UTC `from`..`to`, постранично. */
  async listAll<T extends z.ZodType>(
    path: '/leads' | '/conversations',
    item: T,
    from: string,
    to: string,
  ): Promise<z.infer<T>[]> {
    const out: z.infer<T>[] = [];
    for (let offset = 0; ; offset += WARD_PAGE_SIZE) {
      const page = pageSchema(item).parse(
        await this.get(path, { from, to, limit: WARD_PAGE_SIZE, offset }),
      );
      out.push(...page.data);
      if (page.data.length < WARD_PAGE_SIZE) return out;
    }
  }
}
