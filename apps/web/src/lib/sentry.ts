import { scrubEvent } from '@lidomer/shared';
import type { BrowserOptions } from '@sentry/nextjs';

/**
 * Общие настройки Sentry для браузера и сервера web (решение 0008). Телефоны и имена клиентов не
 * уходят: SDK не собирает пользователя, cookies, заголовки, query и тела; из «хлебных крошек»
 * остаются только переходы между страницами; scrubEvent — второй слой. Replay не включаем.
 */
export function sentryOptions(dsn: string): BrowserOptions {
  return {
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: 0,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    },
    beforeBreadcrumb: (b) => (b.category === 'navigation' ? b : null),
    beforeSend: (event) => scrubEvent(event),
    beforeSendTransaction: () => null,
  };
}
