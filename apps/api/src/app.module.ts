import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { AuthGuard } from './auth/auth.guard';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from './config/config.module';
import { DbModule } from './db/db.module';
import { HealthController } from './health/health.controller';
import { WorkspaceGuard } from './workspaces/workspace.guard';
import { WorkspacesModule } from './workspaces/workspaces.module';

@Module({
  imports: [
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
  ],
  controllers: [HealthController],
  providers: [
    // Порядок важен: сначала вход, потом доступ к компании и роль.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useExisting: WorkspaceGuard },
  ],
})
export class AppModule {}
