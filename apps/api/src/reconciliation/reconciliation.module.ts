import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { FxService } from './fx.service';
import { MetricsController } from './metrics.controller';
import { MetricsRepository } from './metrics.repository';
import { ReconciliationService } from './reconciliation.service';

@Module({
  imports: [WorkspacesModule],
  controllers: [MetricsController],
  providers: [ReconciliationService, FxService, MetricsRepository],
  exports: [ReconciliationService, FxService],
})
export class ReconciliationModule {}
