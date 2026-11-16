import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** Для локальных скриптов: подхватить `.env.local` из корня репозитория (скрипты запускаются из packages/db), если он есть. */
export function loadRootEnv(): void {
  const file = resolve(process.cwd(), '../../.env.local');
  if (existsSync(file)) process.loadEnvFile(file);
}
