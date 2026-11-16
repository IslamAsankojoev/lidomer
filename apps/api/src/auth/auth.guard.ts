import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { JWTVerifyGetKey } from 'jose';
import { ENV, type Env } from '../config/env';
import type { AppRequest } from '../common/request';
import { IS_PUBLIC } from './decorators';
import { JWT_KEYS, verifySupabaseToken } from './jwt';

/** Глобальный гвард: всё закрыто, кроме эндпоинтов с @Public(). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(JWT_KEYS) private readonly keys: JWTVerifyGetKey,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<AppRequest>();
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException('Нужен вход');
    try {
      req.user = await verifySupabaseToken(token, this.keys, this.env.SUPABASE_URL);
      return true;
    } catch {
      throw new UnauthorizedException('Сессия недействительна, войдите снова');
    }
  }
}
