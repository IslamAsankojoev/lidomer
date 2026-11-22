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
  Put,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  type CreateWorkspaceRequest,
  createWorkspaceRequestSchema,
  type InviteMemberRequest,
  type InviteMemberResponse,
  inviteMemberRequestSchema,
  type MeResponse,
  type MembersResponse,
  LOGO_MAX_BYTES,
  type Role,
  roleSchema,
  type UploadLogoRequest,
  uploadLogoRequestSchema,
} from '@lidomer/shared';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { CurrentUser, CurrentWorkspace, RequirePermission } from '../auth/decorators';
import type { AuthUser, WorkspaceContext } from '../common/request';
import { detectImage } from '../common/image';
import { LOGOS_BUCKET, Storage } from '../common/storage';
import { ZodPipe } from '../common/zod.pipe';
import { ENV, type Env } from '../config/env';
import { MembershipRepository } from './membership.repository';
import { SupabaseAdmin } from './supabase-admin';

const userIdParam = new ZodPipe(z.uuid());
const changeRoleSchema = z.object({ role: roleSchema });

@Controller()
export class WorkspacesController {
  constructor(
    @Inject(MembershipRepository) private readonly membership: MembershipRepository,
    @Inject(SupabaseAdmin) private readonly supabase: SupabaseAdmin,
    @Inject(ENV) env: Env,
  ) {
    this.storage = new Storage(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  }

  private readonly storage: Storage;

  /** Текущий пользователь и компании, в которых он участник. */
  @Get('me')
  async me(@CurrentUser() user: AuthUser): Promise<MeResponse> {
    const list = await this.membership.listWorkspacesOf(user.id);
    return {
      user,
      workspaces: list.map(({ logoPath, ...w }) => ({
        ...w,
        logoUrl: logoPath ? this.storage.publicUrl(LOGOS_BUCKET, logoPath) : null,
      })),
    };
  }

  /**
   * Своя компания — только если пользователь ещё ни в одной не состоит: иначе тупик после входа
   * (ни компании, ни приглашения). Участникам компаний новые создавать нельзя.
   */
  @Post('workspaces')
  async createWorkspace(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(createWorkspaceRequestSchema)) body: CreateWorkspaceRequest,
  ): Promise<{ id: string }> {
    const id = await this.membership.createWorkspaceWithOwner(user.id, body.name);
    if (!id)
      throw new ConflictException('Вы уже в команде компании — новую компанию создать нельзя');
    await this.membership.audit({
      workspaceId: id,
      actorUserId: user.id,
      action: 'workspace.create',
      entityType: 'workspace',
      entityId: id,
      after: { name: body.name },
    });
    return { id };
  }

  /**
   * Логотип компании (меню кабинета). PNG, JPEG или WebP до 512 КБ — тип по содержимому файла.
   * Каждая загрузка — новый файл (без кэша старой картинки), прежний удаляется.
   */
  @Put('workspace/logo')
  @HttpCode(204)
  @RequirePermission('settings:manage')
  async uploadLogo(
    @CurrentUser() user: AuthUser,
    @CurrentWorkspace() ws: WorkspaceContext,
    @Body(new ZodPipe(uploadLogoRequestSchema)) body: UploadLogoRequest,
  ): Promise<void> {
    const file = Buffer.from(body.data, 'base64');
    if (file.length > LOGO_MAX_BYTES)
      throw new UnprocessableEntityException('Логотип больше 512 КБ');
    const kind = detectImage(file);
    if (!kind) throw new UnprocessableEntityException('Нужна картинка PNG, JPEG или WebP');
    const path = `${ws.workspaceId}/${randomUUID()}.${kind.ext}`;
    await this.storage.upload(
      LOGOS_BUCKET,
      path,
      file.buffer.slice(file.byteOffset, file.byteOffset + file.length) as ArrayBuffer,
      kind.contentType,
    );
    await this.replaceLogo(user, ws.workspaceId, path);
  }

  @Delete('workspace/logo')
  @HttpCode(204)
  @RequirePermission('settings:manage')
  async removeLogo(
    @CurrentUser() user: AuthUser,
    @CurrentWorkspace() ws: WorkspaceContext,
  ): Promise<void> {
    await this.replaceLogo(user, ws.workspaceId, null);
  }

  private async replaceLogo(user: AuthUser, workspaceId: string, path: string | null) {
    const before = await this.membership.logoPath(workspaceId);
    await this.membership.setLogoPath(workspaceId, path);
    await this.membership.audit({
      workspaceId,
      actorUserId: user.id,
      action: 'workspace.logo',
      entityType: 'workspace',
      entityId: workspaceId,
      before: { logoPath: before },
      after: { logoPath: path },
    });
    // Старый файл больше не нужен; не удалился — не беда, ссылка на него уже не отдаётся.
    if (before) await this.storage.remove(LOGOS_BUCKET, [before]).catch(() => undefined);
  }

  @Get('members')
  @RequirePermission('members:manage')
  async list(@CurrentWorkspace() ws: WorkspaceContext): Promise<MembersResponse> {
    return { members: await this.membership.listMembers(ws.workspaceId) };
  }

  /** Пригласить по email: новый пользователь получает письмо, существующий сразу добавляется. */
  @Post('members/invite')
  @HttpCode(200)
  @RequirePermission('members:manage')
  async invite(
    @CurrentUser() actor: AuthUser,
    @CurrentWorkspace() ws: WorkspaceContext,
    @Body(new ZodPipe(inviteMemberRequestSchema)) body: InviteMemberRequest,
  ): Promise<InviteMemberResponse> {
    // Уже зарегистрированного Supabase не приглашает — добавляем в команду без письма.
    const existing = await this.membership.findUserIdByEmail(body.email);
    const userId = existing ?? (await this.supabase.inviteByEmail(body.email));
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
    return { emailSent: !existing };
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
