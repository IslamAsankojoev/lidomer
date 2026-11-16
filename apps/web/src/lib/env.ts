import { z } from 'zod';

// NEXT_PUBLIC_* подставляются при сборке, поэтому читаем их явно, а не через process.env[key].
const parsed = z
  .object({
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
    NEXT_PUBLIC_API_URL: z.url(),
    // Facebook Login for Business: без них кнопка входа скрыта, остаётся вставка токена.
    NEXT_PUBLIC_META_APP_ID: z.string().optional(),
    NEXT_PUBLIC_META_LOGIN_CONFIG_ID: z.string().optional(),
  })
  .safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_META_APP_ID: process.env.NEXT_PUBLIC_META_APP_ID || undefined,
    NEXT_PUBLIC_META_LOGIN_CONFIG_ID: process.env.NEXT_PUBLIC_META_LOGIN_CONFIG_ID || undefined,
  });

if (!parsed.success) {
  throw new Error(
    `Не заданы переменные окружения web: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}. См. .env.example`,
  );
}

export const env = parsed.data;
