import {
  type CountingSettings,
  type DealStatus,
  defaultDealStatus,
  isAdUtm,
  type LeadChannel,
  type LeadFlag,
  normalizeInstagram,
  normalizePhone,
  toDayKey,
} from '@lidomer/shared';
import { parseWardSource } from '../sources/ward/parse-source';

/** Входные данные сверки — строки таблиц источников (только нужные поля). */
export interface WardLeadIn {
  id: number;
  createdAt: Date;
  name: string | null;
  phone: string | null;
  instagram: string | null;
  status: string | null;
  sourceKind: 'ad' | 'post' | 'direct' | 'unknown';
  sourceAdId: string | null;
  adTitle: string | null;
  sourcePostId: string | null;
  crmEntity: string | null;
  crmId: string | null;
}

export interface DealIn {
  id: string;
  createdAt: Date | null;
  stageId: string | null;
  amountMinor: number | null;
  currency: string | null;
  sourceId: string | null;
  sourceDescription: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  contactId: string | null;
  /** Телефон и имя из пользовательских полей сделки (лид-формы без контакта). */
  phone?: string | null;
  clientName?: string | null;
}

export interface ContactIn {
  name: string | null;
  phone: string | null;
}

export interface OverrideIn {
  id: number;
  leadId: string;
  field: 'channel' | 'status' | 'excluded';
  value: unknown;
}

export interface ReconcileInput {
  timezone: string;
  settings: CountingSettings;
  wardLeads: WardLeadIn[];
  deals: DealIn[];
  contacts: Map<string, ContactIn>;
  /** Статус стадии: выбор владельца или по семантике. */
  stageStatus: Map<string, DealStatus>;
  overrides: OverrideIn[];
  /** Объявления подключённого кабинета Meta; null — Meta не подключена (флаг не ставим). */
  metaAds: MetaAdIn[] | null;
}

/** Объявление Meta с названиями кампании и группы — для привязки лидов. */
export interface MetaAdIn {
  id: string;
  name: string | null;
  campaignName: string | null;
  adsetName: string | null;
}

/** Название для сравнения с UTM: регистр, лишние пробелы и форма Unicode не важны. */
const norm = (v: string | null | undefined) =>
  (v ?? '').normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Индекс объявлений Meta: по id и по тройке «кампания › группа › объявление».
 * Тройка, под которой больше одного объявления (копии с одинаковыми названиями), не попадает
 * в индекс — такую привязку угадывать нельзя.
 */
export function metaAdIndex(ads: MetaAdIn[]) {
  const byId = new Map(ads.map((a) => [a.id, a]));
  const byUtm = new Map<string, MetaAdIn | null>();
  for (const a of ads) {
    const k = [a.campaignName, a.adsetName, a.name].map(norm).join('|');
    byUtm.set(k, byUtm.has(k) ? null : a);
  }
  /** Объявление по UTM сделки: прямо по id в любой метке или по однозначной тройке названий. */
  const fromUtm = (campaign: string | null, adset: string | null, ad: string | null) => {
    for (const v of [ad, adset, campaign]) {
      const byIdHit = v ? byId.get(v.trim()) : undefined;
      if (byIdHit) return byIdHit;
    }
    return byUtm.get([campaign, adset, ad].map(norm).join('|')) ?? null;
  };
  return { byId, fromUtm };
}

export interface LeadRow {
  id: string;
  origin: 'ward' | 'b24';
  createdAt: Date;
  day: string;
  name: string | null;
  phone: string | null;
  instagram: string | null;
  channel: LeadChannel;
  adKey: string | null;
  adId: string | null;
  adName: string | null;
  campaignName: string | null;
  adsetName: string | null;
  postId: string | null;
  wardLeadId: number | null;
  dealId: string | null;
  dealSourceId: string | null;
  status: DealStatus;
  amountMinor: number | null;
  currency: string | null;
  isRepeat: boolean;
  repeatOf: string | null;
  flags: LeadFlag[];
  overrides: number[] | null;
}

const WARD_CHANNEL: Record<WardLeadIn['sourceKind'], LeadChannel> = {
  ad: 'ad',
  post: 'organic',
  direct: 'direct_unknown',
  unknown: 'other',
};

/** Статус Ward, когда сделки нет: new/in_work → в работе. */
function wardStatus(s: string | null): DealStatus {
  return s === 'won' ? 'won' : s === 'lost' ? 'lost' : 'in_work';
}

const utmKey = (d: DealIn) =>
  [d.utmCampaign, d.utmMedium, d.utmContent].map((v) => v ?? '—').join(' › ');

/**
 * Сверка: лид Ward + его сделка → одна строка; сделки без лида Ward — отдельные строки.
 * Источники не меняются; ручные решения — только через overrides.
 */
export function reconcile(input: ReconcileInput): LeadRow[] {
  const meta = input.metaAds ? metaAdIndex(input.metaAds) : null;
  const { timezone, settings } = input;
  const dealsById = new Map(input.deals.map((d) => [d.id, d]));
  const dealStatus = (d: DealIn) =>
    (d.stageId && input.stageStatus.get(d.stageId)) || defaultDealStatus(null);
  const rows: LeadRow[] = [];
  const linkedDeals = new Set<string>();

  for (const w of input.wardLeads) {
    const deal = w.crmEntity === 'deal' && w.crmId ? dealsById.get(w.crmId) : undefined;
    if (deal) linkedDeals.add(deal.id);
    const contact = deal?.contactId ? input.contacts.get(deal.contactId) : undefined;
    const channel = WARD_CHANNEL[w.sourceKind];
    const status = deal ? dealStatus(deal) : wardStatus(w.status);
    const phone = normalizePhone(w.phone) ?? contact?.phone ?? deal?.phone ?? null;
    const flags: LeadFlag[] = [];
    if (!deal) flags.push('no_deal');
    if (!phone) flags.push('no_phone');
    if (w.sourceKind === 'unknown') flags.push('source_unparsed');
    const metaAd = w.sourceAdId ? meta?.byId.get(w.sourceAdId) : undefined;
    if (channel === 'ad' && meta && w.sourceAdId && !metaAd) {
      flags.push('ad_not_connected');
    }
    rows.push({
      id: `ward:${w.id}`,
      origin: 'ward',
      createdAt: w.createdAt,
      day: toDayKey(w.createdAt, timezone),
      name: w.name ?? contact?.name ?? null,
      phone,
      instagram: normalizeInstagram(w.instagram),
      channel,
      adKey: channel === 'ad' ? w.sourceAdId : null,
      adId: channel === 'ad' ? w.sourceAdId : null,
      // Названия — из Meta (точнее заголовка из WARD), иначе то, что дал WARD.
      adName: channel === 'ad' ? (metaAd?.name ?? w.adTitle) : null,
      campaignName: channel === 'ad' ? (metaAd?.campaignName ?? null) : null,
      adsetName: channel === 'ad' ? (metaAd?.adsetName ?? null) : null,
      postId: w.sourcePostId,
      wardLeadId: w.id,
      dealId: deal?.id ?? null,
      dealSourceId: deal?.sourceId ?? null,
      status,
      amountMinor: status === 'won' ? (deal?.amountMinor ?? null) : null,
      currency: deal?.currency ?? null,
      isRepeat: false,
      repeatOf: null,
      flags,
      overrides: null,
    });
  }

  const excluded = new Set(settings.excludedSourceIds);
  const adSources = new Set(settings.adSourceIds);
  for (const d of input.deals) {
    if (linkedDeals.has(d.id) || !d.createdAt) continue;
    if (d.sourceId && excluded.has(d.sourceId)) continue;
    const contact = d.contactId ? input.contacts.get(d.contactId) : undefined;
    const flags: LeadFlag[] = [];

    // Сделку создал Ward, но лида в выгрузке Ward нет: разбираем его описание.
    const fromWard = (d.sourceDescription ?? '').startsWith('WARD');
    const wardSrc = fromWard
      ? parseWardSource({ ad: null, source: d.sourceDescription, post_id: null })
      : null;
    let channel: LeadChannel;
    let adId: string | null = null;
    let adKey: string | null = null;
    let metaHit: MetaAdIn | null = null;
    if (wardSrc) {
      channel = WARD_CHANNEL[wardSrc.kind];
      adId = wardSrc.adId;
      adKey = adId;
      metaHit = (adId && meta?.byId.get(adId)) || null;
      if (wardSrc.kind === 'ad') flags.push('ad_label_without_lead');
    } else if (
      isAdUtm(d.utmSource, d.utmMedium) ||
      (d.sourceId !== null && adSources.has(d.sourceId))
    ) {
      channel = 'ad';
      // UTM → объявление Meta: тогда лид, расход и превью собираются в одной строке креатива.
      const hit = meta?.fromUtm(d.utmCampaign, d.utmMedium, d.utmContent) ?? null;
      if (hit) {
        adId = hit.id;
        adKey = hit.id;
        metaHit = hit;
      } else adKey = d.utmCampaign || d.utmMedium || d.utmContent ? `utm:${utmKey(d)}` : null;
    } else {
      channel = 'other';
    }
    const phone = contact?.phone ?? d.phone ?? null;
    if (!phone) flags.push('no_phone');
    const status = dealStatus(d);
    rows.push({
      id: `b24:${d.id}`,
      origin: 'b24',
      createdAt: d.createdAt,
      day: toDayKey(d.createdAt, timezone),
      name: contact?.name ?? d.clientName ?? null,
      phone,
      instagram: null,
      channel,
      adKey,
      adId,
      adName: channel === 'ad' ? (metaHit?.name ?? (wardSrc ? null : d.utmContent)) : null,
      campaignName:
        channel === 'ad' ? (metaHit?.campaignName ?? (wardSrc ? null : d.utmCampaign)) : null,
      adsetName: channel === 'ad' ? (metaHit?.adsetName ?? (wardSrc ? null : d.utmMedium)) : null,
      postId: wardSrc?.postId ?? null,
      wardLeadId: null,
      dealId: d.id,
      dealSourceId: d.sourceId,
      status,
      amountMinor: status === 'won' ? d.amountMinor : null,
      currency: d.currency,
      isRepeat: false,
      repeatOf: null,
      flags,
      overrides: null,
    });
  }

  // Ручные правки — последние по времени побеждают; excluded убирает лид из журнала.
  const byLead = new Map<string, OverrideIn[]>();
  for (const o of input.overrides) byLead.set(o.leadId, [...(byLead.get(o.leadId) ?? []), o]);
  const result: LeadRow[] = [];
  for (const r of rows) {
    const ovs = byLead.get(r.id);
    if (ovs) {
      r.overrides = ovs.map((o) => o.id);
      let drop = false;
      for (const o of ovs) {
        if (o.field === 'excluded') drop = o.value === true;
        if (o.field === 'channel') r.channel = o.value as LeadChannel;
        if (o.field === 'status') r.status = o.value as DealStatus;
      }
      if (drop) continue;
    }
    result.push(r);
  }

  markRepeats(result, settings.duplicateWindowDays);
  return result;
}

/**
 * Повторное обращение: тот же Instagram или телефон в окне N дней от первого обращения.
 * После окна — снова новый лид.
 */
export function markRepeats(rows: LeadRow[], windowDays: number): void {
  rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
  const windowMs = windowDays * 86_400_000;
  const firstBy = new Map<string, { id: string; at: number }>();
  for (const r of rows) {
    const keys = [r.instagram && `ig:${r.instagram}`, r.phone && `ph:${r.phone}`].filter(
      Boolean,
    ) as string[];
    const t = r.createdAt.getTime();
    const prev = keys.map((k) => firstBy.get(k)).find((p) => p && t - p.at <= windowMs);
    if (prev && windowDays > 0) {
      r.isRepeat = true;
      r.repeatOf = prev.id;
      // Новый ключ того же человека (например, появился телефон) — тоже к первому обращению.
      for (const k of keys) if (!firstBy.has(k)) firstBy.set(k, prev);
    } else {
      for (const k of keys) firstBy.set(k, { id: r.id, at: t });
    }
  }
}
