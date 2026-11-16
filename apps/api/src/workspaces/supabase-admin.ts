import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import { z } from 'zod';
import { ENV, type Env } from '../config/env';

const inviteResponseSchema = z.object({ id: z.uuid() });

/** Узкий клиент Supabase Auth Admin API: только приглашение по email. */
@Injectable()
export class SupabaseAdmin {
  constructor(@Inject(ENV) private readonly env: Env) {}

  async inviteByEmail(email: string): Promise<string> {
    const webOrigin = this.env.WEB_ORIGIN.split(',')[0]!.trim().replace(/\/$/, '');
    const url = new URL('/auth/v1/invite', this.env.SUPABASE_URL);
    url.searchParams.set('redirect_to', `${webOrigin}/auth/confirm`);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: this.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${this.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) {
      throw new InternalServerErrorException(`Supabase не отправил приглашение (${res.status})`);
    }
    return inviteResponseSchema.parse(await res.json()).id;
  }
}
