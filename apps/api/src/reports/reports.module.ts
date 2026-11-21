import { Module } from '@nestjs/common';
// Репозиторий — напрямую: IntegrationsModule сам импортирует ReportsModule (цикл).
import { IntegrationsRepository } from '../integrations/integrations.repository';
import { ReconciliationModule } from '../reconciliation/reconciliation.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { TelegramController } from './telegram.controller';
import { TelegramService } from './telegram.service';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';

@Module({
  imports: [WorkspacesModule, ReconciliationModule],
  controllers: [ReportsController, TelegramController, WhatsappController],
  providers: [ReportsService, TelegramService, WhatsappService, IntegrationsRepository],
  exports: [ReportsService, TelegramService],
})
export class ReportsModule {}
