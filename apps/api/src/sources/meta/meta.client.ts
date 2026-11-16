import { z } from 'zod';
import { HttpError, withRetry } from '../../common/http';
import type { RawRecorder } from '../types';

/** Версия Graph/Marketing API. Истёкшая версия у Marketing API — ошибка, поэтому обновлять раз в полгода. */
export const GRAPH_VERSION = 'v27.0';
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

/** Коды ошибок лимитов Meta: повторить позже, а не падать. */
const RATE_LIMIT_CODES = new Set([
  4, 17, 32, 613, 80000, 80001, 80002, 80003, 80004, 80005, 80006, 80008, 80009, 80014,
]);
/** Токен недействителен или отозван — нужно переподключение. */
const AUTH_CODES = new Set([102, 190]);

const errorSchema = z.looseObject({
  error: z.looseObject({
    message: z.string(),
    code: z.number().optional(),
    error_subcode: z.number().optional(),
  }),
});

const pagedSchema = z.looseObject({
  data: z.array(z.unknown()),
  paging: z.looseObject({ next: z.string().optional() }).optional(),
});

/** Самый высокий процент использования лимитов из заголовков ответа. */
export function usagePercent(headers: Headers): number {
  let max = 0;
  const scan = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(scan);
    else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        if (
          typeof x === 'number' &&
          /call_count|total_cputime|total_time|acc_id_util_pct|app_id_util_pct/.test(k)
        ) {
          max = Math.max(max, x);
        } else scan(x);
      }
    }
  };
  for (const h of [
    'x-business-use-case-usage',
    'x-ad-account-usage',
    'x-app-usage',
    'x-fb-ads-insights-throttle',
  ]) {
    const raw = headers.get(h);
    if (!raw) continue;
    try {
      scan(JSON.parse(raw));
    } catch {
      /* заголовок не JSON — пропускаем */
    }
  }
  return max;
}

/** Заменить токен в любом месте ответа на «[token]». */
export function scrubToken(body: unknown, token: string): unknown {
  if (body === null || body === undefined) return body;
  const json = JSON.stringify(body);
  return json.includes(token) ? (JSON.parse(json.split(token).join('[token]')) as unknown) : body;
}

export interface MetaClientOptions {
  fetchFn?: typeof fetch;
  onResponse?: RawRecorder;
  sleepFn?: (ms: number) => Promise<void>;
}

/** Клиент Graph API: только чтение, токен в заголовке (не в URL и не в raw_payloads). */
export class MetaClient {
  private readonly fetchFn: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly accessToken: string,
    private readonly opts: MetaClientOptions = {},
  ) {
    this.fetchFn = opts.fetchFn ?? fetch;
    this.sleep = opts.sleepFn ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  }

  private async request(url: URL): Promise<unknown> {
    return withRetry(
      async () => {
        const res = await this.fetchFn(url, {
          headers: { Authorization: `Bearer ${this.accessToken}` },
        });
        const body: unknown = await res.json().catch(() => null);
        const params = Object.fromEntries(url.searchParams);
        await this.opts.onResponse?.({
          endpoint: url.pathname.replace(`/${GRAPH_VERSION}`, ''),
          request: params,
          httpStatus: res.status,
          // Meta кладёт токен в ссылки paging.next — в raw_payloads его быть не должно.
          response: scrubToken(body, this.accessToken),
        });
        const err = errorSchema.safeParse(body);
        if (!res.ok || err.success) {
          const code = err.success ? err.data.error.code : undefined;
          const message = `Meta: ${err.success ? err.data.error.message : `HTTP ${res.status}`}`;
          if (code !== undefined && AUTH_CODES.has(code)) throw new HttpError(401, message, body);
          if (code !== undefined && RATE_LIMIT_CODES.has(code))
            throw new HttpError(429, message, body);
          throw new HttpError(res.status >= 400 ? res.status : 400, message, body);
        }
        // Подходим к лимиту — притормаживаем, а не ждём блокировки.
        const usage = usagePercent(res.headers);
        if (usage >= 90) throw new HttpError(429, `Meta: лимит запросов использован на ${usage}%`);
        if (usage >= 75) await this.sleep(5_000);
        return body;
      },
      { sleepFn: this.opts.sleepFn, minDelayMs: 5_000, retries: 2 },
    );
  }

  async get(path: string, params: Record<string, string> = {}): Promise<unknown> {
    const url = new URL(GRAPH + path);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    return this.request(url);
  }

  /** Все страницы списка (по ссылке `paging.next`). */
  async getAll<T extends z.ZodType>(
    path: string,
    item: T,
    params: Record<string, string>,
  ): Promise<z.infer<T>[]> {
    const out: z.infer<T>[] = [];
    let url: URL | null = new URL(GRAPH + path);
    for (const [k, v] of Object.entries({ limit: '500', ...params })) url.searchParams.set(k, v);
    while (url) {
      const page = pagedSchema.parse(await this.request(url));
      out.push(...page.data.map((d) => item.parse(d)));
      url = page.paging?.next ? new URL(page.paging.next) : null;
      // В ссылке next Meta может вернуть access_token — убираем, токен идёт заголовком.
      url?.searchParams.delete('access_token');
    }
    return out;
  }
}

/** Обменять код из Facebook Login for Business на токен системного пользователя. */
export async function exchangeLoginCode(
  code: string,
  appId: string,
  appSecret: string,
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  const url = new URL(`${GRAPH}/oauth/access_token`);
  url.searchParams.set('client_id', appId);
  url.searchParams.set('client_secret', appSecret);
  // Код из JS SDK обменивается с пустым redirect_uri.
  url.searchParams.set('redirect_uri', '');
  url.searchParams.set('code', code);
  const res = await fetchFn(url);
  const body: unknown = await res.json().catch(() => null);
  const ok = z.object({ access_token: z.string() }).safeParse(body);
  if (!res.ok || !ok.success) {
    const err = errorSchema.safeParse(body);
    throw new HttpError(
      res.status,
      `Meta: ${err.success ? err.data.error.message : 'не удалось обменять код'}`,
    );
  }
  return ok.data.access_token;
}
