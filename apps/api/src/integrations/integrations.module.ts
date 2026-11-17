import { Module } from '@nestjs/common';
import { SecretBox } from '../common/secret-box';
import { ENV, type Env } from '../config/env';
import { JobRunner } from '../jobs/job-runner';
import { JobsController } from '../jobs/jobs.controller';
import { Watchdog } from '../jobs/watchdog';
import { JobQueue } from '../jobs/queue';
import { ReconciliationModule } from '../reconciliation/reconciliation.module';
import { ReportsModule } from '../reports/reports.module';
import { type AdapterRegistry, SOURCE_ADAPTERS } from '../sources/registry';
import { Storage } from '../common/storage';
import { createB24Adapter } from '../sources/bitrix24/b24.adapter';
import { createMetaAdapter } from '../sources/meta/meta.adapter';
import { createWardAdapter } from '../sources/ward/ward.adapter';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { B24StagesController, B24StagesRepository } from './b24-stages.controller';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsRepository } from './integrations.repository';
import { IntegrationsService, SECRET_BOX } from './integrations.service';

@Module({
  imports: [WorkspacesModule, ReconciliationModule, ReportsModule],
  controllers: [B24StagesController, IntegrationsController, JobsController],
  providers: [
    IntegrationsRepository,
    B24StagesRepository,
    IntegrationsService,
    JobQueue,
    JobRunner,
    Watchdog,
    {
      provide: SECRET_BOX,
      inject: [ENV],
      useFactory: (env: Env) => new SecretBox(env.ENCRYPTION_KEY),
    },
    {
      provide: SOURCE_ADAPTERS,
      inject: [ENV],
      useFactory: (env: Env): AdapterRegistry => ({
        ward: createWardAdapter() as AdapterRegistry['ward'],
        bitrix24: createB24Adapter() as AdapterRegistry['bitrix24'],
        meta_ads: createMetaAdapter({
          appId: env.META_APP_ID,
          appSecret: env.META_APP_SECRET,
          storage: new Storage(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY),
        }) as AdapterRegistry['meta_ads'],
      }),
    },
  ],
})
export class IntegrationsModule {}
