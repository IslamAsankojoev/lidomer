'use client';

import { createBrowserClient } from '@supabase/ssr';
import { env } from '@/lib/env';

let client: ReturnType<typeof createBrowserClient> | undefined;

/** Клиент Supabase в браузере — только для входа и сессии. Таблицы браузер не читает. */
export function supabaseBrowser() {
  client ??= createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  return client;
}
