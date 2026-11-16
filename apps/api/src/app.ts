import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { ENV, type Env, isAllowedOrigin } from './config/env';

/** Настройка приложения, общая для запуска и тестов. */
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

export async function createApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  configureApp(app);
  return app;
}
