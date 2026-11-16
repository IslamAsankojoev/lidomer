import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { NextConfig } from 'next';

// Локально переменные лежат в одном .env.local в корне репозитория. На Vercel его нет.
const rootEnv = resolve(process.cwd(), '../../.env.local');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const nextConfig: NextConfig = {
  // Кабинет целиком за входом и берёт данные из api на клиенте — статической оболочки нет,
  // поэтому Cache Components не включаем (см. docs/decisions/0003-web-architecture.md).
  turbopack: {
    rules: {
      '*.css': { loaders: ['@tailwindcss/turbopack'], as: '*.css' },
    },
  },
};

export default nextConfig;
