import { buildMetrics, type InsightIn, type MetricLead, type MetricRow } from './build-metrics';
import {
  byTime,
  type ContactIn,
  type DealIn,
  type FirstByKey,
  type LeadRow,
  markRepeats,
  type OverrideIn,
  personKeys,
  reconcile,
  type ReconcileInput,
  type RepeatRow,
  type WardLeadIn,
} from './reconcile';

/*
 * Частичная пересборка журнала (решение 0013): пересчитываются только лиды, чьи источники изменились,
 * и метрики их дней. Правила — те же `reconcile`, `markRepeats` и `buildMetrics`, что и в полной
 * пересборке; результат совпадает с ней на тех же данных (incremental.test.ts).
 */

/** Строка журнала, нужная частичной пересборке: ключи человека, пометка повтора, день и сделка. */
export interface StoredLead extends RepeatRow {
  day: string;
  dealId: string | null;
}

export interface RepeatFlag {
  id: string;
  isRepeat: boolean;
  repeatOf: string | null;
}

/** Чтение и запись частичной пересборки. В api — `DbReconcileStore`, в тестах — массивы в памяти. */
export interface ReconcileStore {
  wardLeads(ids: number[]): Promise<WardLeadIn[]>;
  /** Лиды WARD, которые ссылаются на эти сделки (`crm_entity = 'deal'`). */
  wardLeadsOfDeals(dealIds: string[]): Promise<WardLeadIn[]>;
  deals(ids: string[]): Promise<DealIn[]>;
  contacts(ids: string[]): Promise<Map<string, ContactIn>>;
  insights(days: string[]): Promise<InsightIn[]>;
  leadsByIds(ids: string[]): Promise<StoredLead[]>;
  /** Строки журнала с `created_at >= at`. */
  leadsFrom(at: Date): Promise<StoredLead[]>;
  /** Строки журнала раньше `before` с одним из телефонов или Instagram. */
  leadsWithKeys(before: Date, phones: string[], instagrams: string[]): Promise<StoredLead[]>;
  leadsOnDays(days: string[]): Promise<MetricLead[]>;
  writeLeads(change: { remove: string[]; insert: LeadRow[]; flags: RepeatFlag[] }): Promise<void>;
  writeMetrics(days: string[], rows: MetricRow[]): Promise<void>;
}

/** Что изменилось в источниках с прошлой пересборки. */
export interface SourceChanges {
  wardIds: number[];
  /** Изменённые сделки и сделки изменённых контактов. */
  dealIds: string[];
  /** Дни, за которые изменился расход Meta. */
  insightDays: string[];
}

/** Справочники сверки — читаются целиком, они маленькие. */
export type ReconcileContext = Omit<ReconcileInput, 'wardLeads' | 'deals' | 'contacts'>;

export type RefreshResult = { leads: number; days: number } | { full: string };

const unique = <T>(xs: (T | null | undefined)[]) =>
  [...new Set(xs)].filter((x): x is T => x !== null && x !== undefined);

/** Лиды, которые ручная правка убрала из журнала (последняя правка `excluded` — true). */
function excludedLeads(overrides: OverrideIn[]): Set<string> {
  const last = new Map<string, boolean>();
  for (const o of overrides) if (o.field === 'excluded') last.set(o.leadId, o.value === true);
  return new Set([...last].filter(([, v]) => v).map(([id]) => id));
}

const sameKeys = (a: RepeatRow, b: RepeatRow) =>
  a.createdAt.getTime() === b.createdAt.getTime() &&
  a.phone === b.phone &&
  a.instagram === b.instagram;

/**
 * Состояние `markRepeats` на момент `before` по нужным ключам — из строк журнала до этого момента
 * (их пометки уже верны). Повторяет шаги `markRepeats`: первое обращение ставит себя на свои ключи,
 * повтор отдаёт своё первое обращение ключам, которых ещё не было.
 */
async function repeatsBefore(
  store: ReconcileStore,
  before: Date,
  rows: RepeatRow[],
): Promise<FirstByKey> {
  const phones = unique(rows.map((r) => r.phone));
  const instagrams = unique(rows.map((r) => r.instagram));
  const history =
    phones.length || instagrams.length
      ? (await store.leadsWithKeys(before, phones, instagrams)).sort(byTime)
      : [];
  const at = new Map(history.map((l) => [l.id, l.createdAt.getTime()]));
  const missing = unique(history.map((l) => l.repeatOf)).filter((id) => !at.has(id));
  if (missing.length)
    for (const l of await store.leadsByIds(missing)) at.set(l.id, l.createdAt.getTime());

  const firstBy: FirstByKey = new Map();
  for (const l of history) {
    const keys = personKeys(l);
    if (l.isRepeat && l.repeatOf) {
      const prev = { id: l.repeatOf, at: at.get(l.repeatOf) ?? -Infinity };
      for (const k of keys) if (!firstBy.has(k)) firstBy.set(k, prev);
    } else {
      for (const k of keys) firstBy.set(k, { id: l.id, at: l.createdAt.getTime() });
    }
  }
  return firstBy;
}

/** Пересчитать строки журнала затронутых лидов. Возвращает дни, где строки поменялись. */
async function refreshRows(
  store: ReconcileStore,
  ctx: ReconcileContext,
  changes: SourceChanges,
): Promise<{ rows: number; days: Set<string> } | { full: string }> {
  // 1. Изменённые лиды WARD и их сделки: новая ссылка — из источника, прежняя — из журнала.
  const changed = await store.wardLeads(changes.wardIds);
  const stored = new Map(
    (await store.leadsByIds(changed.map((w) => `ward:${w.id}`))).map((l) => [l.id, l]),
  );
  const excluded = excludedLeads(ctx.overrides);
  const dealIds = new Set(changes.dealIds);
  for (const w of changed) {
    const prev = stored.get(`ward:${w.id}`);
    // Лид убран ручной правкой: его прежней ссылки на сделку в журнале нет.
    if (!prev && excluded.has(`ward:${w.id}`)) return { full: 'изменён исключённый лид WARD' };
    if (prev?.dealId) dealIds.add(prev.dealId);
    if (w.crmEntity === 'deal' && w.crmId) dealIds.add(w.crmId);
  }

  // 2. Замыкание по связи «лид → сделка»: у каждой сделки — все её лиды, у каждого лида — его сделка.
  const ward = new Map(changed.map((w) => [w.id, w]));
  for (const w of await store.wardLeadsOfDeals([...dealIds])) ward.set(w.id, w);
  const deals = await store.deals([...dealIds]);
  const contacts = await store.contacts(unique(deals.map((d) => d.contactId)));
  const rows = reconcile({ ...ctx, wardLeads: [...ward.values()], deals, contacts });

  // 3. Сравнение с журналом: не изменились время и ключи человека — пометки повтора прежние.
  const candidates = new Set([
    ...[...ward.keys()].map((id) => `ward:${id}`),
    ...[...dealIds].map((id) => `b24:${id}`),
  ]);
  const before = new Map((await store.leadsByIds([...candidates])).map((l) => [l.id, l]));
  const fresh = new Map(rows.map((r) => [r.id, r]));
  const days = new Set<string>();
  let from = Infinity;
  for (const id of candidates) {
    const o = before.get(id);
    const n = fresh.get(id);
    if (o) days.add(o.day);
    if (n) days.add(n.day);
    if (o && n && sameKeys(o, n)) {
      n.isRepeat = o.isRepeat;
      n.repeatOf = o.repeatOf;
    } else {
      for (const r of [o, n]) if (r) from = Math.min(from, r.createdAt.getTime());
    }
  }

  // 4. Иначе — пометки повторов всего журнала начиная с самой ранней такой строки.
  const flags: RepeatFlag[] = [];
  if (from !== Infinity) {
    const start = new Date(from);
    const tail = (await store.leadsFrom(start)).filter((l) => !candidates.has(l.id));
    const was = new Map(tail.map((l) => [l.id, { isRepeat: l.isRepeat, repeatOf: l.repeatOf }]));
    const window: RepeatRow[] = [...rows.filter((r) => r.createdAt >= start), ...tail];
    const firstBy = await repeatsBefore(store, start, window);
    for (const r of window) {
      r.isRepeat = false;
      r.repeatOf = null;
    }
    markRepeats(window, ctx.settings.duplicateWindowDays, firstBy);
    for (const l of tail) {
      const w = was.get(l.id)!;
      if (w.isRepeat === l.isRepeat && w.repeatOf === l.repeatOf) continue;
      flags.push({ id: l.id, isRepeat: l.isRepeat, repeatOf: l.repeatOf });
      days.add(l.day);
    }
  }

  await store.writeLeads({ remove: [...candidates], insert: rows, flags });
  return { rows: rows.length + flags.length, days };
}

/**
 * Частичная пересборка: строки журнала затронутых лидов и метрики дней, где что-то поменялось.
 * `{ full }` — частичная не гарантирует точности, нужна полная (ничего не записано).
 */
export async function refreshLeads(
  store: ReconcileStore,
  changes: SourceChanges,
  context: () => Promise<ReconcileContext>,
  metaConnected: boolean,
): Promise<RefreshResult> {
  const days = new Set(changes.insightDays);
  let leads = 0;
  if (changes.wardIds.length || changes.dealIds.length) {
    const res = await refreshRows(store, await context(), changes);
    if ('full' in res) return res;
    leads = res.rows;
    for (const d of res.days) days.add(d);
  }
  if (days.size) {
    const list = [...days].sort();
    const [rows, insights] = await Promise.all([
      store.leadsOnDays(list),
      metaConnected ? store.insights(list) : null,
    ]);
    await store.writeMetrics(list, buildMetrics(rows, insights));
  }
  return { leads, days: days.size };
}
