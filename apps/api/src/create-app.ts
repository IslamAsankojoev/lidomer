import type { INestApplication } from '@nestjs/common';
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
}
