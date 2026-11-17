import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';
import { LoggerModule } from 'nestjs-pino';
import { AuthGuard } from './auth/auth.guard';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from './config/config.module';
import { DbModule } from './db/db.module';
import { HealthController } from './health/health.controller';
import { IntegrationsModule } from './integrations/integrations.module';
import { WorkspaceGuard } from './workspaces/workspace.guard';
import { WorkspacesModule } from './workspaces/workspaces.module';

@Module({
  imports: [
    SentryModule.forRoot(),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        // Токены и cookies в логи не пишем. Тела запросов не логируются вообще.
        redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
        autoLogging: { ignore: (req) => req.url === '/health' },
      },
    }),
    ConfigModule,
    DbModule,
    AuthModule,
    WorkspacesModule,
    IntegrationsModule,
  ],
  controllers: [HealthController],
  providers: [
    // Необработанные ошибки — в Sentry (без DSN ничего не отправляется); 4xx не считаются ошибками.
    { provide: APP_FILTER, useClass: SentryGlobalFilter },
    // Порядок важен: сначала вход, потом доступ к компании и роль.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useExisting: WorkspaceGuard },
  ],
})
export class AppModule {}
