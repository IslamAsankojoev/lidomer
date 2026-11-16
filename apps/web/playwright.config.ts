import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// Локально логин тестового пользователя берётся из .env.local в корне (E2E_EMAIL, E2E_PASSWORD).
const rootEnv = resolve(__dirname, '../../.env.local');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

/** Сквозные тесты кабинета. Против запущенного кабинета: E2E_BASE_URL или localhost:3000. */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    locale: 'ru-RU',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
});
