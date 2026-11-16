import { defineConfig } from 'drizzle-kit';
import { loadRootEnv } from './src/env';

loadRootEnv();

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  // Схему auth и прочие служебные схемы Supabase не трогаем.
  schemaFilter: ['public'],
  dbCredentials: { url: process.env.DATABASE_URL_DIRECT ?? '' },
  strict: true,
  verbose: true,
});
