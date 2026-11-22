/**
 * Частичная пересборка на настоящем Postgres: upsert'ы «только при изменении», поиск изменений по
 * `synced_at`, запись журнала и метрик — и сравнение с полной пересборкой на тех же данных.
 * Пишет в базу, поэтому только на отдельной тестовой базе со схемой (`drizzle-kit push`):
 *   TEST_DATABASE_URL=postgres://…/lidomer_test pnpm --filter @lidomer/api test reconcile.db
 * `.env.local` не читается — на боевой базе не запускается. В CI пропускается.
 */
import {
  b24Contacts,
  b24Deals,
  b24Stages,
  createDb,
  integrations,
  leadOverrides,
  leads,
  metaAds,
  metaAdsets,
  metaCampaigns,
  metaInsightsDaily,
  metricsDaily,
  wardLeads,
  workspaces,
} from '@lidomer/db';
import { asc, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { excludedSet, onlyChanged } from '../src/common/upsert';
import { ReconciliationService } from '../src/reconciliation/reconciliation.service';
import { clone, ctx, gen, type World } from './reconcile-world';

const url = process.env.TEST_DATABASE_URL;

describe.runIf(!!url)('частичная пересборка в базе = полная', { timeout: 120_000 }, () => {
  const { db, client } = url ? createDb(url, { max: 2 }) : ({} as never);
  const service = url ? new ReconciliationService(db) : ({} as never);
  let ws = '';

  /** Источники — теми же upsert'ами, что у адаптеров. */
  async function upsert(w: World) {
    const workspaceId = ws;
    if (w.ward.length)
      await db
        .insert(wardLeads)
        .values(w.ward.map((l) => ({ ...l, workspaceId })))
        .onConflictDoUpdate({
          target: [wardLeads.workspaceId, wardLeads.id],
          ...onlyChanged(wardLeads, excludedSet(wardLeads, ['workspaceId', 'id'])),
        });
    await db
      .insert(b24Contacts)
      .values(w.contacts.map((c) => ({ ...c, workspaceId })))
      .onConflictDoUpdate({
        target: [b24Contacts.workspaceId, b24Contacts.id],
        ...onlyChanged(b24Contacts, excludedSet(b24Contacts, ['workspaceId', 'id'])),
      });
    await db
      .insert(b24Deals)
      .values(w.deals.map((d) => ({ ...d, workspaceId })))
      .onConflictDoUpdate({
        target: [b24Deals.workspaceId, b24Deals.id],
        ...onlyChanged(b24Deals, excludedSet(b24Deals, ['workspaceId', 'id'])),
      });
    await db
      .insert(metaInsightsDaily)
      .values(
        w.insights.map((i) => ({
          ...i,
          workspaceId,
          accountId: 'act_1',
          campaignId: 'c1',
          adsetId: 's1',
          impressions: 0,
          clicks: 0,
        })),
      )
      .onConflictDoUpdate({
        target: [metaInsightsDaily.workspaceId, metaInsightsDaily.adId, metaInsightsDaily.day],
        ...onlyChanged(
          metaInsightsDaily,
          excludedSet(metaInsightsDaily, ['workspaceId', 'adId', 'day']),
        ),
      });
  }

  /** «Прошло 10 минут»: записанное в источники — раньше прошлой пересборки с запасом. */
  async function age() {
    for (const t of [
      wardLeads,
      b24Deals,
      b24Contacts,
      metaInsightsDaily,
      metaAds,
      metaCampaigns,
      metaAdsets,
    ])
      await db.execute(
        sql`update ${t} set synced_at = synced_at - interval '10 minutes' where workspace_id = ${ws}`,
      );
    await db.execute(
      sql`update ${b24Stages} set updated_at = updated_at - interval '10 minutes' where workspace_id = ${ws}`,
    );
  }

  async function snapshot() {
    const [l, m] = await Promise.all([
      db.select().from(leads).where(eq(leads.workspaceId, ws)).orderBy(asc(leads.id)),
      db
        .select()
        .from(metricsDaily)
        .where(eq(metricsDaily.workspaceId, ws))
        .orderBy(asc(metricsDaily.day), asc(metricsDaily.channel), asc(metricsDaily.adKey)),
    ]);
    return {
      leads: l.map(({ builtAt: _, ...r }) => r),
      metrics: m.map(({ builtAt: _, ...r }) => r),
    };
  }

  beforeAll(async () => {
    const [w] = await db
      .insert(workspaces)
      .values({
        name: `test-reconcile-${Date.now()}`,
        timezone: ctx.timezone,
        settings: { counting: ctx.settings },
      })
      .returning();
    ws = w!.id;
    await db
      .insert(integrations)
      .values({ workspaceId: ws, type: 'meta_ads', name: 'Meta', status: 'connected' });
    await db.insert(b24Stages).values(
      [...ctx.stageStatus].map(([stageId, status], i) => ({
        workspaceId: ws,
        stageId,
        categoryId: 0,
        name: stageId,
        sort: i,
        mappedStatus: status,
      })),
    );
    for (const o of ctx.overrides)
      await db.insert(leadOverrides).values({
        workspaceId: ws,
        leadId: o.leadId,
        field: o.field,
        value: o.value as object,
        reason: 'тест',
      });
    const camps = [...new Set(ctx.metaAds!.map((a) => a.campaignName!))];
    const sets = [...new Set(ctx.metaAds!.map((a) => `${a.campaignName}|${a.adsetName}`))];
    await db
      .insert(metaCampaigns)
      .values(camps.map((name, i) => ({ workspaceId: ws, id: `c${i}`, accountId: 'act_1', name })));
    await db.insert(metaAdsets).values(
      sets.map((k, i) => ({
        workspaceId: ws,
        id: `s${i}`,
        accountId: 'act_1',
        campaignId: `c${camps.indexOf(k.split('|')[0]!)}`,
        name: k.split('|')[1]!,
      })),
    );
    await db.insert(metaAds).values(
      ctx.metaAds!.map((a) => ({
        workspaceId: ws,
        id: a.id,
        accountId: 'act_1',
        campaignId: `c${camps.indexOf(a.campaignName!)}`,
        adsetId: `s${sets.indexOf(`${a.campaignName}|${a.adsetName}`)}`,
        name: a.name!,
      })),
    );
  });

  afterAll(async () => {
    if (ws) await db.delete(workspaces).where(eq(workspaces.id, ws));
    await client?.end();
  });

  it('после каждой синхронизации журнал и метрики совпадают с полной пересборкой', async () => {
    const g = gen(21);
    let w = g.world;
    await upsert(w);
    expect(await service.refresh(ws)).toBe('full'); // первая — всегда полная
    await age();

    // Та же выгрузка ещё раз: строки не тронуты, пересборки нет.
    await upsert(w);
    expect(await service.refresh(ws)).toBe('skip');

    const modes: string[] = [];
    for (let step = 0; step < 25; step++) {
      const next = clone(w);
      for (let i = 0; i < 1 + Math.floor(g.r() * 4); i++) g.mutate(next);
      await upsert(next);
      modes.push(await service.refresh(ws));
      const partial = await snapshot();
      await service.rebuild(ws);
      expect(partial).toEqual(await snapshot());
      await age();
      w = next;
    }
    expect(modes.filter((m) => m === 'partial').length).toBeGreaterThan(15);
  });

  it('сопоставление стадии изменилось — полная пересборка', async () => {
    await db.update(b24Stages).set({ mappedStatus: 'won' }).where(eq(b24Stages.stageId, 'NEW'));
    expect(await service.refresh(ws)).toBe('full');
  });
});
