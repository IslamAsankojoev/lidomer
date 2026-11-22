import { b24Stages, wardLeads } from '@lidomer/db';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { describe, expect, it } from 'vitest';
import { excludedSet, onlyChanged } from './upsert';

const db = drizzle.mock({ casing: 'snake_case' });

describe('onlyChanged', () => {
  it('обновляет строку, только если данные отличаются; synced_at не сравнивается', () => {
    const q = db
      .insert(wardLeads)
      .values({ workspaceId: 'w', id: 1, createdAt: new Date(0), sourceKind: 'ad' })
      .onConflictDoUpdate({
        target: [wardLeads.workspaceId, wardLeads.id],
        ...onlyChanged(wardLeads, excludedSet(wardLeads, ['workspaceId', 'id'])),
      })
      .toSQL().sql;
    expect(q).toContain('"synced_at" = excluded."synced_at"');
    const where = q.slice(q.lastIndexOf(' where '));
    expect(where).toContain('"ward_leads"."crm_id"');
    expect(where).toContain('excluded."crm_id"');
    expect(where).toContain('is distinct from');
    expect(where).not.toContain('synced_at');
  });

  it('служебное время из ignore не сравнивается', () => {
    const q = db
      .insert(b24Stages)
      .values({ workspaceId: 'w', stageId: 'NEW', categoryId: 0, name: 'Новая' })
      .onConflictDoUpdate({
        target: [b24Stages.workspaceId, b24Stages.stageId],
        ...onlyChanged(b24Stages, { name: sql`excluded.name`, updatedAt: new Date() }, [
          'updatedAt',
        ]),
      })
      .toSQL().sql;
    expect(q.slice(q.lastIndexOf(' where '))).toBe(
      ' where ("b24_stages"."name") is distinct from (excluded.name)',
    );
  });
});
