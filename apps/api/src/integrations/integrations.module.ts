import { Module } from '@nestjs/common';
import { SecretBox } from '../common/secret-box';
import { ENV, type Env } from '../config/env';
import { JobRunner } from '../jobs/job-runner';
import { JobsController } from '../jobs/jobs.controller';
import { JobQueue } from '../jobs/queue';
import { type AdapterRegistry, SOURCE_ADAPTERS } from '../sources/registry';
import { createWardAdapter } from '../sources/ward/ward.adapter';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsRepository } from './integrations.repository';
import { IntegrationsService, SECRET_BOX } from './integrations.service';

@Module({
  imports: [WorkspacesModule],
  controllers: [IntegrationsController, JobsController],
  providers: [
    IntegrationsRepository,
    IntegrationsService,
    JobQueue,
    JobRunner,
    {
      provide: SECRET_BOX,
      inject: [ENV],
      useFactory: (env: Env) => new SecretBox(env.ENCRYPTION_KEY),
    },
    {
      provide: SOURCE_ADAPTERS,
      useFactory: (): AdapterRegistry => ({ ward: createWardAdapter() as AdapterRegistry['ward'] }),
    },
  ],
})
export class IntegrationsModule {}
