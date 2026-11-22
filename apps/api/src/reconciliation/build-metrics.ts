import type { LeadChannel } from '@lidomer/shared';
import type { LeadRow } from './reconcile';

/** Типы действий Meta, которые считаются лидом (по целям кампаний). Меняется в настройках позже. */
export const DEFAULT_META_LEAD_ACTIONS = [
  'lead',
  'onsite_conversion.lead_grouped',
  'onsite_conversion.messaging_conversation_started_7d',
];

export interface InsightIn {
  adId: string;
  day: string;
  spendMinor: number;
  currency: string;
  actions: { action_type: string; value: string }[];
}

/** Поля строки журнала, из которых считаются метрики. */
export type MetricLead = Pick<
  LeadRow,
  'day' | 'channel' | 'adKey' | 'isRepeat' | 'phone' | 'status' | 'amountMinor'
>;

export interface MetricRow {
  day: string;
  channel: LeadChannel;
  adKey: string;
  leads: number;
  repeats: number;
  withPhone: number;
  sales: number;
  salesAmountMinor: number;
  spendMinor: number | null;
  spendCurrency: string | null;
  metaLeads: number | null;
}

/**
 * Агрегаты по дню × каналу × объявлению. Лид считается один раз (повторы — отдельно),
 * продажа — по любой строке со статусом «продажа». Расход и лиды Meta — только для рекламы.
 */
export function buildMetrics(
  leads: MetricLead[],
  insights: InsightIn[] | null,
  leadActions: string[] = DEFAULT_META_LEAD_ACTIONS,
): MetricRow[] {
  const rows = new Map<string, MetricRow>();
  const get = (day: string, channel: LeadChannel, adKey: string) => {
    const key = `${day}|${channel}|${adKey}`;
    let r = rows.get(key);
    if (!r) {
      r = {
        day,
        channel,
        adKey,
        leads: 0,
        repeats: 0,
        withPhone: 0,
        sales: 0,
        salesAmountMinor: 0,
        spendMinor: null,
        spendCurrency: null,
        metaLeads: null,
      };
      rows.set(key, r);
    }
    return r;
  };

  for (const l of leads) {
    const r = get(l.day, l.channel, l.channel === 'ad' ? (l.adKey ?? '') : '');
    if (l.isRepeat) r.repeats++;
    else {
      r.leads++;
      if (l.phone) r.withPhone++;
    }
    if (l.status === 'won') {
      r.sales++;
      r.salesAmountMinor += l.amountMinor ?? 0;
    }
  }

  const actions = new Set(leadActions);
  for (const i of insights ?? []) {
    const r = get(i.day, 'ad', i.adId);
    r.spendMinor = (r.spendMinor ?? 0) + i.spendMinor;
    r.spendCurrency = i.currency;
    const metaLeads = i.actions
      .filter((a) => actions.has(a.action_type))
      .reduce((sum, a) => sum + Number(a.value || 0), 0);
    r.metaLeads = (r.metaLeads ?? 0) + metaLeads;
  }
  return [...rows.values()].sort((a, b) => a.day.localeCompare(b.day));
}
