import type { EmailOtpType } from '@supabase/supabase-js';
import { type NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

const ALLOWED: EmailOtpType[] = ['invite', 'recovery', 'email', 'signup', 'email_change'];

/**
 * Ссылка из письма Supabase (приглашение, сброс пароля). Шаблон письма должен вести на
 * `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=invite` — см. docs/setup/etap-1.md.
 */
export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get('token_hash');
  const type = request.nextUrl.searchParams.get('type') as EmailOtpType | null;

  if (tokenHash && type && ALLOWED.includes(type)) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      const next = type === 'invite' || type === 'recovery' ? '/auth/set-password' : '/';
      return NextResponse.redirect(new URL(next, request.url));
    }
  }
  return NextResponse.redirect(new URL('/login?error=link', request.url));
}
