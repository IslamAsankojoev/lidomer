import { z } from 'zod';

/** Переменные окружения api. Проверяются при старте: без них приложение не запускается. */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  /** Пул транзакций Supabase (порт 6543). */
  DATABASE_URL: z.url(),
  SUPABASE_URL: z.url(),
  /** Секретный ключ Supabase — только для приглашений через Admin API. */
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  /** Адрес кабинета, например https://lidomer.example.com. Через запятую — несколько. */
  WEB_ORIGIN: z.string().min(1),
  /** Необязательное регулярное выражение для preview-доменов web на Vercel. */
  WEB_ORIGIN_PATTERN: z.string().optional(),
  /** 32 байта в base64 — ключ AES-256-GCM для секретов интеграций. */
  ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, 'base64').length === 32, 'Нужно 32 байта в base64'),
  /** Секрет вызова POST /jobs/tick из Supabase Cron. */
  CRON_SECRET: z.string().min(32),
  /** Токен бота от @BotFather. Без него отчёты и алерты не отправляются. */
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  LOG_LEVEL: z.enum(['silent', 'fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});
export type Env = z.infer<typeof envSchema>;

export const ENV = Symbol('ENV');

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Неверные переменные окружения: ${fields}`);
  }
  return parsed.data;
}

/** Разрешён ли Origin для CORS. */
export function isAllowedOrigin(
  origin: string,
  env: Pick<Env, 'WEB_ORIGIN' | 'WEB_ORIGIN_PATTERN'>,
): boolean {
  const exact = env.WEB_ORIGIN.split(',').map((s) => s.trim().replace(/\/$/, ''));
  if (exact.includes(origin)) return true;
  return env.WEB_ORIGIN_PATTERN ? new RegExp(`^${env.WEB_ORIGIN_PATTERN}$`).test(origin) : false;
}
