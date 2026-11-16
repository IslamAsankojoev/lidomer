import {
  BadRequestException,
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { can, type Permission } from '@lidomer/shared';
import { z } from 'zod';
import { REQUIRED_PERMISSION } from '../auth/decorators';
import type { AppRequest } from '../common/request';
import { MembershipRepository } from './membership.repository';

const workspaceIdSchema = z.uuid();

/**
 * Для эндпоинтов с @RequirePermission: проверяет, что пользователь — участник компании из
 * заголовка X-Workspace-Id и что его роль даёт нужное право. Иначе 403.
 */
@Injectable()
export class WorkspaceGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(MembershipRepository) private readonly membership: MembershipRepository,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const permission = this.reflector.getAllAndOverride<Permission | undefined>(REQUIRED_PERMISSION, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!permission) return true;

    const req = ctx.switchToHttp().getRequest<AppRequest>();
    if (!req.user) throw new ForbiddenException();
    const parsed = workspaceIdSchema.safeParse(req.headers['x-workspace-id']);
    if (!parsed.success) throw new BadRequestException('Нужен заголовок X-Workspace-Id');

    const role = await this.membership.findRole(req.user.id, parsed.data);
    if (!role) throw new ForbiddenException('Нет доступа к этой компании');
    if (!can(role, permission)) throw new ForbiddenException('Недостаточно прав');

    req.workspace = { workspaceId: parsed.data, role };
    return true;
  }
}
