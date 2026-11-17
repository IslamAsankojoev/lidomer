import * as Sentry from '@sentry/nextjs';
import { env } from '@/lib/env';
import { sentryOptions } from '@/lib/sentry';

// Ошибки в браузере — в Sentry, только если задан DSN.
if (env.NEXT_PUBLIC_SENTRY_DSN) Sentry.init(sentryOptions(env.NEXT_PUBLIC_SENTRY_DSN));
