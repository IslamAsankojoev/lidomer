// Точка входа: Vercel ищет файл, который сам импортирует NestJS и вызывает listen().
// Sentry — первым импортом, до NestJS.
import './instrument';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp } from './create-app';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  configureApp(app);
  await app.listen(process.env.PORT ?? 4000);
}

void bootstrap();
