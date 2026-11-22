import { Body, Controller, Delete, Get, HttpCode, Inject, Post, Put } from '@nestjs/common';
import {
  type ConnectGreenApiRequest,
  connectGreenApiRequestSchema,
  type WhatsappStatus,
} from '@lidomer/shared';
import { CurrentUser, CurrentWorkspace, RequirePermission } from '../auth/decorators';
import type { AuthUser, WorkspaceContext } from '../common/request';
import { ZodPipe } from '../common/zod.pipe';
import { MembershipRepository } from '../workspaces/membership.repository';
import { WhatsappService } from './whatsapp.service';

/** WhatsApp компании через Green API. Ключи — только на запись; в ответах токен маской. */
@Controller('whatsapp')
export class WhatsappController {
  constructor(
    @Inject(WhatsappService) private readonly whatsapp: WhatsappService,
    @Inject(MembershipRepository) private readonly membership: MembershipRepository,
  ) {}

  @Get()
  @RequirePermission('integrations:read')
  status(@CurrentWorkspace() ws: WorkspaceContext): Promise<WhatsappStatus> {
    return this.whatsapp.status(ws.workspaceId);
  }

  /** Подключить или заменить ключи. */
  @Put()
  @RequirePermission('integrations:manage')
  async connect(
    @CurrentUser() user: AuthUser,
    @CurrentWorkspace() ws: WorkspaceContext,
    @Body(new ZodPipe(connectGreenApiRequestSchema)) body: ConnectGreenApiRequest,
  ): Promise<WhatsappStatus> {
    const res = await this.whatsapp.connect(ws.workspaceId, body);
    // В аудит — без ключей.
    await this.audit(ws, user, 'integration.connect', { idInstance: body.idInstance });
    return res;
  }

  @Post('refresh')
  @HttpCode(200)
  @RequirePermission('integrations:manage')
  refresh(@CurrentWorkspace() ws: WorkspaceContext): Promise<WhatsappStatus> {
    return this.whatsapp.refresh(ws.workspaceId);
  }

  @Delete()
  @HttpCode(204)
  @RequirePermission('integrations:manage')
  async disconnect(@CurrentUser() user: AuthUser, @CurrentWorkspace() ws: WorkspaceContext) {
    await this.whatsapp.disconnect(ws.workspaceId);
    await this.audit(ws, user, 'integration.disconnect', null);
  }

  private audit(ws: WorkspaceContext, user: AuthUser, action: string, after: object | null) {
    return this.membership.audit({
      workspaceId: ws.workspaceId,
      actorUserId: user.id,
      action,
      entityType: 'integration',
      entityId: 'green_api',
      after,
    });
  }
}
