import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put } from '@nestjs/common';
import {
  type IntegrationSummary,
  integrationTypeSchema,
  type IntegrationType,
  type SyncRunSummary,
} from '@lidomer/shared';
import { CurrentUser, CurrentWorkspace, RequirePermission } from '../auth/decorators';
import type { AuthUser, WorkspaceContext } from '../common/request';
import { ZodPipe } from '../common/zod.pipe';
import { IntegrationsService } from './integrations.service';

const typeParam = new ZodPipe(integrationTypeSchema);

@Controller('integrations')
export class IntegrationsController {
  constructor(@Inject(IntegrationsService) private readonly service: IntegrationsService) {}

  @Get()
  @RequirePermission('integrations:read')
  async list(
    @CurrentWorkspace() ws: WorkspaceContext,
  ): Promise<{ integrations: IntegrationSummary[] }> {
    return { integrations: await this.service.list(ws.workspaceId) };
  }

  @Get(':type/runs')
  @RequirePermission('integrations:read')
  async runs(
    @CurrentWorkspace() ws: WorkspaceContext,
    @Param('type', typeParam) type: IntegrationType,
  ): Promise<{ runs: SyncRunSummary[] }> {
    return { runs: await this.service.runs(ws.workspaceId, type) };
  }

  /** Подключить или заменить ключи. Тело проверяет адаптер источника. */
  @Put(':type')
  @RequirePermission('integrations:manage')
  connect(
    @CurrentUser() user: AuthUser,
    @CurrentWorkspace() ws: WorkspaceContext,
    @Param('type', typeParam) type: IntegrationType,
    @Body() body: unknown,
  ): Promise<IntegrationSummary> {
    return this.service.connect(ws.workspaceId, user.id, type, body);
  }

  @Post(':type/test')
  @HttpCode(200)
  @RequirePermission('integrations:manage')
  test(@CurrentWorkspace() ws: WorkspaceContext, @Param('type', typeParam) type: IntegrationType) {
    return this.service.test(ws.workspaceId, type);
  }

  @Post(':type/sync')
  @HttpCode(200)
  @RequirePermission('integrations:manage')
  sync(@CurrentWorkspace() ws: WorkspaceContext, @Param('type', typeParam) type: IntegrationType) {
    return this.service.syncNow(ws.workspaceId, type);
  }

  @Delete(':type')
  @RequirePermission('integrations:manage')
  disconnect(
    @CurrentUser() user: AuthUser,
    @CurrentWorkspace() ws: WorkspaceContext,
    @Param('type', typeParam) type: IntegrationType,
  ) {
    return this.service.disconnect(ws.workspaceId, user.id, type);
  }
}
