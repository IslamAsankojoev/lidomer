/**
 * Фейковые данные сверки для тестов (не реальные люди и сделки): генератор источников и случайных
 * правок, как их принесла бы синхронизация, и полная пересборка — эталон для частичной.
 */
import { DEFAULT_COUNTING, type DealStatus } from '@lidomer/shared';
import { buildMetrics, type InsightIn, type MetricRow } from '../src/reconciliation/build-metrics';
import type { ReconcileContext } from '../src/reconciliation/incremental';
import {
  type ContactIn,
  type DealIn,
  type LeadRow,
  reconcile,
  type WardLeadIn,
} from '../src/reconciliation/reconcile';

export interface World {
  ward: WardLeadIn[];
  deals: DealIn[];
  contacts: (ContactIn & { id: string })[];
  insights: InsightIn[];
}
export interface Journal {
  leads: LeadRow[];
  metrics: MetricRow[];
}

export const DAY = 86_400_000;
export const NOW = Date.parse('2026-11-23T12:00:00Z');
const ADS = ['101', '102', '103'];

export const ctx: ReconcileContext = {
  timezone: 'Asia/Bishkek',
  settings: { ...DEFAULT_COUNTING, duplicateWindowDays: 7, adSourceIds: ['ADS'] },
  stageStatus: new Map<string, DealStatus>([
    ['NEW', 'in_work'],
    ['WON', 'won'],
    ['LOSE', 'lost'],
  ]),
  // Сделка 2003 убрана вручную, лид WARD 5 — тоже; у лида 7 вручную сменили канал.
  overrides: [
    { id: 1, leadId: 'b24:2003', field: 'excluded', value: true },
    { id: 2, leadId: 'ward:5', field: 'excluded', value: true },
    { id: 3, leadId: 'ward:7', field: 'channel', value: 'organic' },
  ],
  metaAds: [
    { id: '101', name: 'Видео 1', campaignName: 'Осень', adsetName: 'Бишкек' },
    { id: '102', name: 'Видео 2', campaignName: 'Осень', adsetName: 'Ош' },
    { id: '103', name: 'Карусель', campaignName: 'Зима', adsetName: 'Бишкек' },
  ],
};

/** Полная пересборка — как `ReconciliationService.rebuild`. */
export function full(w: World): Journal {
  const leads = reconcile({
    ...ctx,
    wardLeads: w.ward,
    deals: w.deals,
    contacts: new Map(w.contacts.map((c) => [c.id, c])),
  });
  return { leads, metrics: buildMetrics(leads, w.insights) };
}

export const clone = <T>(v: T): T => structuredClone(v);

function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gen(seed: number) {
  const r = rng(seed);
  const pick = <T>(xs: T[]): T => xs[Math.floor(r() * xs.length)]!;
  const at = (daysBack = 60) => new Date(NOW - Math.floor(r() * daysBack * DAY));
  const phone = () =>
    r() < 0.2 ? null : `+99670000${String(Math.floor(r() * 30)).padStart(4, '0')}`;
  const ig = () => (r() < 0.2 ? null : `user${Math.floor(r() * 40)}`);
  let nextWard = 1;
  let nextDeal = 2001;
  let nextContact = 1;

  const contact = (w: World): string => {
    const id = `c${nextContact++}`;
    w.contacts.push({ id, name: `Клиент ${id}`, phone: phone() });
    return id;
  };
  const deal = (w: World, createdAt: Date | null): DealIn => {
    const kind = r();
    const d: DealIn = {
      id: String(nextDeal++),
      createdAt,
      stageId: pick(['NEW', 'NEW', 'WON', 'LOSE']),
      amountMinor: r() < 0.7 ? Math.floor(r() * 100_000) : null,
      currency: 'USD',
      sourceId: kind < 0.3 ? 'ADS' : pick(['WEB', 'CALL', 'WEBFORM']),
      sourceDescription: kind > 0.9 ? `WARD Direct · реклама #${pick(ADS)}` : null,
      utmSource: kind < 0.5 ? 'ig' : null,
      utmMedium: kind < 0.5 ? pick(['Бишкек', 'Ош']) : null,
      utmCampaign: kind < 0.5 ? pick(['Осень', 'Зима']) : null,
      utmContent: kind < 0.5 ? pick(['Видео 1', 'Видео 2', 'Карусель']) : null,
      contactId: r() < 0.8 ? contact(w) : null,
      phone: r() < 0.2 ? phone() : null,
      clientName: null,
    };
    w.deals.push(d);
    return d;
  };
  const wardLead = (w: World, createdAt = at()): WardLeadIn => {
    const linked = r() < 0.7;
    const d = linked
      ? r() < 0.15 && w.deals.length
        ? pick(w.deals) // лид WARD к уже существующей сделке
        : deal(w, new Date(createdAt.getTime() + 60_000))
      : null;
    const kind = pick(['ad', 'ad', 'post', 'direct', 'unknown'] as const);
    const l: WardLeadIn = {
      id: nextWard++,
      createdAt,
      name: null,
      phone: phone(),
      instagram: ig(),
      status: pick(['new', 'in_work', 'won', 'lost']),
      sourceKind: kind,
      sourceAdId: kind === 'ad' ? pick([...ADS, '999']) : null,
      adTitle: kind === 'ad' ? 'Заголовок' : null,
      sourcePostId: kind === 'post' ? 'p1' : null,
      crmEntity: d ? 'deal' : r() < 0.5 ? 'lead' : null,
      crmId: d ? d.id : null,
    };
    w.ward.push(l);
    return l;
  };
  const insight = (w: World, day: string, adId: string) => {
    const i = w.insights.find((x) => x.day === day && x.adId === adId);
    const row: InsightIn = {
      adId,
      day,
      spendMinor: Math.floor(r() * 50_000),
      currency: 'USD',
      actions: [{ action_type: 'lead', value: String(Math.floor(r() * 10)) }],
    };
    if (i) Object.assign(i, row);
    else w.insights.push(row);
  };
  const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10);

  const world: World = { ward: [], deals: [], contacts: [], insights: [] };
  for (let i = 0; i < 80; i++) wardLead(world);
  for (let i = 0; i < 60; i++) deal(world, at());
  deal(world, null); // сделка без даты создания в журнал не попадает
  for (let i = 0; i < 40; i++) insight(world, dayKey(NOW - Math.floor(r() * 30) * DAY), pick(ADS));

  /** Случайная правка источника — как её принесла бы синхронизация. */
  const mutate = (w: World) => {
    const k = Math.floor(r() * 11);
    const someWard = () => pick(w.ward);
    const someDeal = () => pick(w.deals);
    if (k === 0) wardLead(w, at(2));
    else if (k === 1) wardLead(w, at(60));
    else if (k === 2) someWard().status = pick(['won', 'lost', 'in_work']);
    else if (k === 3) {
      const l = someWard();
      const d = r() < 0.7 ? someDeal() : null;
      l.crmEntity = d ? 'deal' : 'lead';
      l.crmId = d ? d.id : null;
    } else if (k === 4) someWard().phone = phone();
    else if (k === 5) someWard().instagram = ig();
    else if (k === 6) deal(w, at(r() < 0.5 ? 2 : 60));
    else if (k === 7) {
      const d = someDeal();
      d.stageId = pick(['NEW', 'WON', 'LOSE']);
      d.amountMinor = Math.floor(r() * 100_000);
    } else if (k === 8) {
      const c = pick(w.contacts);
      c.phone = phone();
      c.name = `Клиент ${c.id}*`;
    } else if (k === 9) someDeal().contactId = r() < 0.5 ? pick(w.contacts).id : contact(w);
    else insight(w, dayKey(NOW - Math.floor(r() * 30) * DAY), pick(ADS));
  };
  return { world, mutate, wardLead, deal, r };
}
