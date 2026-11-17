/**
 * Фильтр событий Sentry для api и web (решение 0008): телефоны и имена клиентов не уходят в Sentry.
 * Тела запросов и ответов, query-строки, cookies и заголовки авторизации вырезаются целиком, в текстах
 * ошибок телефоны маскируются, у пользователя остаётся только id.
 */

/** Похоже на телефон: 9–15 цифр, допускаются +, пробелы, дефисы и скобки между ними. */
const PHONE_IN_TEXT = /\+?\d[\d\s()-]{7,18}\d/g;

export function maskPhonesInText(text: string): string {
  return text.replace(PHONE_IN_TEXT, (m) => {
    const digits = m.replace(/\D/g, '').length;
    return digits >= 9 && digits <= 15 ? '[телефон]' : m;
  });
}

/** Нужная часть события Sentry — без зависимости от SDK. */
export interface ScrubbableEvent {
  message?: string;
  exception?: { values?: { value?: string }[] };
  request?: {
    url?: string;
    data?: unknown;
    query_string?: unknown;
    cookies?: unknown;
    headers?: Record<string, string>;
  };
  user?: { id?: string | number } & Record<string, unknown>;
  breadcrumbs?: { message?: string; data?: unknown }[];
  extra?: unknown;
}

const SECRET_HEADERS = new Set(['authorization', 'cookie', 'x-workspace-id']);

export function scrubEvent<T extends ScrubbableEvent>(event: T): T {
  if (event.message) event.message = maskPhonesInText(event.message);
  for (const v of event.exception?.values ?? []) if (v.value) v.value = maskPhonesInText(v.value);
  if (event.request) {
    delete event.request.data;
    delete event.request.query_string;
    delete event.request.cookies;
    if (event.request.url) event.request.url = event.request.url.split('?')[0];
    if (event.request.headers)
      event.request.headers = Object.fromEntries(
        Object.entries(event.request.headers).filter(([k]) => !SECRET_HEADERS.has(k.toLowerCase())),
      );
  }
  if (event.user) event.user = event.user.id === undefined ? {} : { id: event.user.id };
  if (event.breadcrumbs)
    event.breadcrumbs = event.breadcrumbs.map((b) => ({
      ...b,
      message: b.message ? maskPhonesInText(b.message) : b.message,
      data: undefined,
    }));
  delete event.extra;
  return event;
}
