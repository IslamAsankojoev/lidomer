import { Module } from '@nestjs/common';
import { ReconciliationModule } from '../reconciliation/reconciliation.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { TelegramController } from './telegram.controller';
import { TelegramService } from './telegram.service';

@Module({
  imports: [WorkspacesModule, ReconciliationModule],
  controllers: [ReportsController, TelegramController],
  providers: [ReportsService, TelegramService],
  exports: [ReportsService, TelegramService],
})
export class ReportsModule {}
