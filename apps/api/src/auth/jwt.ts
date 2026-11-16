import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { AuthUser } from '../common/request';

export const JWT_KEYS = Symbol('JWT_KEYS');

/** Публичные ключи Supabase Auth (асимметричные JWT signing keys). */
export function supabaseJwks(supabaseUrl: string): JWTVerifyGetKey {
  return createRemoteJWKSet(new URL('/auth/v1/.well-known/jwks.json', supabaseUrl));
}

/** Проверяет access-токен Supabase и возвращает пользователя. Бросает ошибку на любой неверный токен. */
export async function verifySupabaseToken(
  token: string,
  keys: JWTVerifyGetKey,
  supabaseUrl: string,
): Promise<AuthUser> {
  const { payload } = await jwtVerify(token, keys, {
    issuer: new URL('/auth/v1', supabaseUrl).toString(),
    audience: 'authenticated',
  });
  if (typeof payload.sub !== 'string') throw new Error('В токене нет sub');
  return { id: payload.sub, email: typeof payload.email === 'string' ? payload.email : null };
}
