import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Permission } from '@lidomer/shared';
import type { AppRequest, AuthUser, WorkspaceContext } from '../common/request';

export const IS_PUBLIC = 'isPublic';
/** Эндпоинт без входа (например, /health). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const REQUIRED_PERMISSION = 'requiredPermission';
/**
 * Эндпоинт работает в контексте компании (заголовок X-Workspace-Id) и требует право.
 * Без этого декоратора эндпоинт не видит данных компаний.
 */
export const RequirePermission = (permission: Permission) =>
  SetMetadata(REQUIRED_PERMISSION, permission);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const user = ctx.switchToHttp().getRequest<AppRequest>().user;
  if (!user) throw new Error('CurrentUser без AuthGuard');
  return user;
});

export const CurrentWorkspace = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): WorkspaceContext => {
    const ws = ctx.switchToHttp().getRequest<AppRequest>().workspace;
    if (!ws) throw new Error('CurrentWorkspace без @RequirePermission');
    return ws;
  },
);
