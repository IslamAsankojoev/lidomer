import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ENV, type Env, isAllowedOrigin } from './config/env';

/** Настройка приложения, общая для запуска (main.ts) и тестов. */
export function configureApp(app: INestApplication): void {
  const env = app.get<Env>(ENV);
  app.enableCors({
    origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) =>
      cb(null, !origin || isAllowedOrigin(origin, env)),
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Workspace-Id'],
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    maxAge: 600,
  });
  app.enableShutdownHooks();
  // Логотип приходит в base64 (до 512 КБ файла ≈ 700 КБ JSON) — стандартных 100 КБ мало.
  (app as NestExpressApplication).useBodyParser('json', { limit: '1mb' });
}
