import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  type InviteMemberRequest,
  inviteMemberRequestSchema,
  type MeResponse,
  type MembersResponse,
  type Role,
  roleSchema,
} from '@lidomer/shared';
import { z } from 'zod';
import { CurrentUser, CurrentWorkspace, RequirePermission } from '../auth/decorators';
import type { AuthUser, WorkspaceContext } from '../common/request';
import { ZodPipe } from '../common/zod.pipe';
import { MembershipRepository } from './membership.repository';
import { SupabaseAdmin } from './supabase-admin';

const userIdParam = new ZodPipe(z.uuid());
const changeRoleSchema = z.object({ role: roleSchema });

@Controller()
export class WorkspacesController {
  constructor(
    @Inject(MembershipRepository) private readonly membership: MembershipRepository,
    @Inject(SupabaseAdmin) private readonly supabase: SupabaseAdmin,
  ) {}

  /** Текущий пользователь и компании, в которых он участник. */
  @Get('me')
  async me(@CurrentUser() user: AuthUser): Promise<MeResponse> {
    return { user, workspaces: await this.membership.listWorkspacesOf(user.id) };
  }

  @Get('members')
  @RequirePermission('members:manage')
  async list(@CurrentWorkspace() ws: WorkspaceContext): Promise<MembersResponse> {
    return { members: await this.membership.listMembers(ws.workspaceId) };
  }

  /** Пригласить по email: новый пользователь получает письмо, существующий сразу добавляется. */
  @Post('members/invite')
  @HttpCode(204)
  @RequirePermission('members:manage')
  async invite(
    @CurrentUser() actor: AuthUser,
    @CurrentWorkspace() ws: WorkspaceContext,
    @Body(new ZodPipe(inviteMemberRequestSchema)) body: InviteMemberRequest,
  ): Promise<void> {
    const userId =
      (await this.membership.findUserIdByEmail(body.email)) ??
      (await this.supabase.inviteByEmail(body.email));
    const before = await this.membership.findRole(userId, ws.workspaceId);
    if (before) throw new ConflictException('Этот человек уже в команде');
    await this.membership.upsertMember(ws.workspaceId, userId, body.role);
    await this.membership.audit({
      workspaceId: ws.workspaceId,
      actorUserId: actor.id,
      action: 'member.invite',
      entityType: 'member',
      entityId: userId,
      after: { role: body.role },
    });
  }

  @Patch('members/:userId')
  @HttpCode(204)
  @RequirePermission('members:manage')
  async changeRole(
    @CurrentUser() actor: AuthUser,
    @CurrentWorkspace() ws: WorkspaceContext,
    @Param('userId', userIdParam) userId: string,
    @Body(new ZodPipe(changeRoleSchema)) body: { role: Role },
  ): Promise<void> {
    const before = await this.membership.findRole(userId, ws.workspaceId);
    if (!before) throw new NotFoundException('Участник не найден');
    if (before === 'owner' && body.role !== 'owner') await this.assertNotLastOwner(ws.workspaceId);
    await this.membership.upsertMember(ws.workspaceId, userId, body.role);
    await this.membership.audit({
      workspaceId: ws.workspaceId,
      actorUserId: actor.id,
      action: 'member.change_role',
      entityType: 'member',
      entityId: userId,
      before: { role: before },
      after: { role: body.role },
    });
  }

  @Delete('members/:userId')
  @HttpCode(204)
  @RequirePermission('members:manage')
  async remove(
    @CurrentUser() actor: AuthUser,
    @CurrentWorkspace() ws: WorkspaceContext,
    @Param('userId', userIdParam) userId: string,
  ): Promise<void> {
    const before = await this.membership.findRole(userId, ws.workspaceId);
    if (!before) throw new NotFoundException('Участник не найден');
    if (before === 'owner') await this.assertNotLastOwner(ws.workspaceId);
    await this.membership.removeMember(ws.workspaceId, userId);
    await this.membership.audit({
      workspaceId: ws.workspaceId,
      actorUserId: actor.id,
      action: 'member.remove',
      entityType: 'member',
      entityId: userId,
      before: { role: before },
    });
  }

  private async assertNotLastOwner(workspaceId: string): Promise<void> {
    if ((await this.membership.countOwners(workspaceId)) <= 1) {
      throw new ConflictException('В компании должен остаться хотя бы один владелец');
    }
  }
}
