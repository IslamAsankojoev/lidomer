// Sentry подключается до всего остального (решение 0008). Без SENTRY_DSN выключен:
// локально и в тестах ничего не уходит.
import * as Sentry from '@sentry/nestjs';
import { scrubEvent } from '@lidomer/shared';

const dsn = process.env.SENTRY_DSN;
if (dsn)
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',
    // Телефоны и имена клиентов в Sentry не попадают: SDK не собирает пользователя, cookies,
    // заголовки, query, тела запросов и запросы к базе; scrubEvent — второй слой.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: { allow: ['user-agent', 'content-type'] }, response: false },
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      queues: false,
    },
    tracesSampleRate: 0,
    beforeSend: (event) => scrubEvent(event),
    beforeSendTransaction: () => null,
  });
