import { describe, expect, it } from 'vitest';
import {
  clone,
  ctx,
  DAY,
  full,
  gen,
  type Journal,
  NOW,
  type World,
} from '../../test/reconcile-world';
import type { MetricRow } from './build-metrics';
import {
  type ReconcileStore,
  refreshLeads,
  type SourceChanges,
  type StoredLead,
} from './incremental';
import type { LeadRow } from './reconcile';

/** Журнал и источники в памяти — то же, что DbReconcileStore делает запросами. */
function memoryStore(w: World, j: Journal): ReconcileStore {
  const stored = (l: LeadRow): StoredLead => ({
    id: l.id,
    createdAt: new Date(l.createdAt),
    day: l.day,
    phone: l.phone,
    instagram: l.instagram,
    isRepeat: l.isRepeat,
    repeatOf: l.repeatOf,
    dealId: l.dealId,
  });
  return {
    wardLeads: async (ids) => clone(w.ward.filter((x) => ids.includes(x.id))),
    wardLeadsOfDeals: async (ids) =>
      clone(w.ward.filter((x) => x.crmEntity === 'deal' && x.crmId && ids.includes(x.crmId))),
    deals: async (ids) => clone(w.deals.filter((d) => ids.includes(d.id))),
    contacts: async (ids) =>
      new Map(clone(w.contacts.filter((c) => ids.includes(c.id))).map((c) => [c.id, c])),
    insights: async (days) => clone(w.insights.filter((i) => days.includes(i.day))),
    leadsByIds: async (ids) => j.leads.filter((l) => ids.includes(l.id)).map(stored),
    leadsFrom: async (at) => j.leads.filter((l) => l.createdAt >= at).map(stored),
    leadsWithKeys: async (before, phones, igs) =>
      j.leads
        .filter(
          (l) =>
            l.createdAt < before &&
            ((l.phone && phones.includes(l.phone)) || (l.instagram && igs.includes(l.instagram))),
        )
        .map(stored),
    leadsOnDays: async (days) => clone(j.leads.filter((l) => days.includes(l.day))),
    writeLeads: async ({ remove, insert, flags }) => {
      j.leads = [...j.leads.filter((l) => !remove.includes(l.id)), ...clone(insert)];
      for (const f of flags)
        Object.assign(
          j.leads.find((l) => l.id === f.id)!,
          f,
        );
    },
    writeMetrics: async (days, rows) => {
      j.metrics = [...j.metrics.filter((m) => !days.includes(m.day)), ...clone(rows)];
    },
  };
}

/** Что изменилось — как это видит `synced_at`: строка отличается от прежней или новая. */
function diff(a: World, b: World): SourceChanges {
  const changed = <T>(xs: T[], ys: T[], key: (x: T) => string) => {
    const old = new Map(xs.map((x) => [key(x), JSON.stringify(x)]));
    return ys.filter((y) => old.get(key(y)) !== JSON.stringify(y));
  };
  const contacts = new Set(changed(a.contacts, b.contacts, (c) => c.id).map((c) => c.id));
  const deals = new Set(changed(a.deals, b.deals, (d) => d.id).map((d) => d.id));
  for (const d of b.deals) if (d.contactId && contacts.has(d.contactId)) deals.add(d.id);
  return {
    wardIds: changed(a.ward, b.ward, (x) => String(x.id)).map((x) => x.id),
    dealIds: [...deals],
    insightDays: [
      ...new Set(changed(a.insights, b.insights, (i) => `${i.adId}|${i.day}`).map((i) => i.day)),
    ],
  };
}

const sortLeads = (xs: LeadRow[]) => [...xs].sort((a, b) => a.id.localeCompare(b.id));
const sortMetrics = (xs: MetricRow[]) =>
  [...xs].sort((a, b) =>
    `${a.day}|${a.channel}|${a.adKey}`.localeCompare(`${b.day}|${b.channel}|${b.adKey}`),
  );

/** Частичная пересборка поверх журнала `j`; `{ full }` — как в сервисе, полная. */
async function refresh(before: World, after: World, j: Journal) {
  const res = await refreshLeads(memoryStore(after, j), diff(before, after), async () => ctx, true);
  if ('full' in res) Object.assign(j, full(after));
  return res;
}

function expectSame(j: Journal, w: World) {
  const f = full(w);
  expect(sortLeads(j.leads)).toEqual(sortLeads(f.leads));
  expect(sortMetrics(j.metrics)).toEqual(sortMetrics(f.metrics));
}

// ---------- Тесты ----------

describe('частичная пересборка = полная', () => {
  it('на сотнях случайных правок журнал и метрики совпадают с полной пересборкой', async () => {
    let partial = 0;
    let shifted = 0;
    for (const seed of [1, 2, 3, 4, 5]) {
      const g = gen(seed);
      let w = g.world;
      const j = full(w);
      for (let step = 0; step < 60; step++) {
        const next = clone(w);
        const n = 1 + Math.floor(g.r() * 4);
        for (let i = 0; i < n; i++) g.mutate(next);
        const repeatsBefore = j.leads.filter((l) => l.isRepeat).length;
        const res = await refresh(w, next, j);
        if (!('full' in res)) partial++;
        if (j.leads.filter((l) => l.isRepeat).length !== repeatsBefore) shifted++;
        expectSame(j, next);
        w = next;
      }
    }
    // Почти всё — частичной пересборкой, и повторы по пути действительно сдвигались.
    expect(partial).toBeGreaterThan(250);
    expect(shifted).toBeGreaterThan(20);
  });

  it('смена стадии старой сделки: повторы не трогаются, метрики — только её дня', async () => {
    const g = gen(42);
    const w = g.world;
    const old = g.deal(w, new Date(NOW - 50 * DAY));
    old.stageId = 'NEW';
    const j = full(w);
    const next = clone(w);
    const d = next.deals.find((x) => x.id === old.id)!;
    d.stageId = 'WON';
    d.amountMinor = 7_500_00;
    const res = await refresh(w, next, j);
    expect(res).toEqual({ leads: 1, days: 1 });
    expectSame(j, next);
  });

  it('новый телефон у контакта старой сделки сдвигает повторы вперёд по журналу', async () => {
    const g = gen(7);
    const w = g.world;
    const first = g.deal(w, new Date(NOW - 20 * DAY));
    const later = g.deal(w, new Date(NOW - 18 * DAY));
    w.contacts.push({ id: 'c-first', name: 'Клиент', phone: null });
    Object.assign(first, { contactId: 'c-first', phone: null });
    Object.assign(later, { contactId: null, phone: '+996700009999' });
    const j = full(w);
    expect(j.leads.find((l) => l.id === `b24:${later.id}`)!.isRepeat).toBe(false);

    const next = clone(w);
    next.contacts.find((x) => x.id === 'c-first')!.phone = '+996700009999';
    await refresh(w, next, j);
    expect(j.leads.find((l) => l.id === `b24:${later.id}`)).toMatchObject({
      isRepeat: true,
      repeatOf: `b24:${first.id}`,
    });
    expectSame(j, next);
  });

  it('лид WARD перепривязан к другой сделке: прежняя возвращается в журнал отдельной строкой', async () => {
    const g = gen(9);
    const w = g.world;
    const l = g.wardLead(w, new Date(NOW - 40 * DAY));
    const x = g.deal(w, new Date(NOW - 45 * DAY));
    const y = g.deal(w, new Date(NOW - 10 * DAY));
    l.crmEntity = 'deal';
    l.crmId = x.id;
    const j = full(w);
    expect(j.leads.some((r) => r.id === `b24:${x.id}`)).toBe(false);

    const next = clone(w);
    next.ward.find((r) => r.id === l.id)!.crmId = y.id;
    const res = await refresh(w, next, j);
    expect('full' in res).toBe(false);
    expect(j.leads.some((r) => r.id === `b24:${x.id}`)).toBe(true);
    expect(j.leads.some((r) => r.id === `b24:${y.id}`)).toBe(false);
    expectSame(j, next);
  });

  it('изменился лид WARD, убранный ручной правкой, — полная пересборка', async () => {
    const g = gen(11);
    const w = g.world;
    const j = full(w);
    const next = clone(w);
    next.ward.find((r) => r.id === 5)!.status = 'won';
    const res = await refreshLeads(memoryStore(next, j), diff(w, next), async () => ctx, true);
    expect(res).toEqual({ full: 'изменён исключённый лид WARD' });
  });

  it('расход Meta задним числом — метрики одного дня, журнал не читается', async () => {
    const g = gen(13);
    const w = g.world;
    const j = full(w);
    const next = clone(w);
    next.insights[0]!.spendMinor += 1_000;
    let loaded = false;
    const res = await refreshLeads(
      memoryStore(next, j),
      diff(w, next),
      async () => {
        loaded = true;
        return ctx;
      },
      true,
    );
    expect(res).toEqual({ leads: 0, days: 1 });
    expect(loaded).toBe(false);
    expectSame(j, next);
  });

  it('без изменений ничего не пишется', async () => {
    const g = gen(15);
    const j = full(g.world);
    const res = await refreshLeads(
      memoryStore(g.world, j),
      { wardIds: [], dealIds: [], insightDays: [] },
      async () => ctx,
      true,
    );
    expect(res).toEqual({ leads: 0, days: 0 });
  });
});
