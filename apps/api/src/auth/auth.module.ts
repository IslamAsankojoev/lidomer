import { Module } from '@nestjs/common';
import { ENV, type Env } from '../config/env';
import { JWT_KEYS, supabaseJwks } from './jwt';

@Module({
  providers: [{ provide: JWT_KEYS, inject: [ENV], useFactory: (env: Env) => supabaseJwks(env.SUPABASE_URL) }],
  exports: [JWT_KEYS],
})
export class AuthModule {}
