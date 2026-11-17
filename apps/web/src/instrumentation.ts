import * as Sentry from '@sentry/nextjs';
import { sentryOptions } from '@/lib/sentry';

/** Сервер web (картинка отчёта, proxy): ошибки — в Sentry, только если задан DSN. */
export function register(): void {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (dsn) Sentry.init(sentryOptions(dsn));
}

export const onRequestError = Sentry.captureRequestError;
