import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MIGRATIONS_COUNT } from '@lidomer/db';
import { describe, expect, it } from 'vitest';
import { schemaVerdict } from './watchdog';

describe('сторож миграций', () => {
  it('MIGRATIONS_COUNT совпадает с журналом drizzle (поднять после pnpm db:generate)', () => {
    const journal = JSON.parse(
      readFileSync(
        resolve(__dirname, '../../../../packages/db/migrations/meta/_journal.json'),
        'utf8',
      ),
    ) as { entries: unknown[] };
    expect(MIGRATIONS_COUNT).toBe(journal.entries.length);
  });

  it('база отстала — один алерт, догнала — сообщение о восстановлении', () => {
    const at = new Date('2026-11-24T08:00:00Z');
    expect(schemaVerdict(17, 17, null)).toBe('ok');
    expect(schemaVerdict(18, 17, null)).toBe('ok');
    expect(schemaVerdict(15, 17, null)).toBe('behind');
    expect(schemaVerdict(15, 17, at)).toBe('still_behind');
    expect(schemaVerdict(17, 17, at)).toBe('recovered');
  });
});
