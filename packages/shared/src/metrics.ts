/**
 * Формулы метрик — чистые функции. null означает «нет данных», а не ноль:
 * нули вместо отсутствующих данных не показываются никогда.
 */

/** Цена за лид в минимальных единицах. Органика не входит: только рекламные лиды. */
export function costPerLead(spendMinor: number | null, adLeads: number | null): number | null {
  if (spendMinor === null || adLeads === null || adLeads === 0) return null;
  return Math.round(spendMinor / adLeads);
}

/** Доля в процентах с одним знаком. */
export function percent(part: number | null, total: number | null): number | null {
  if (part === null || total === null || total === 0) return null;
  return Math.round((part / total) * 1000) / 10;
}

/** Изменение к прошлому периоду в процентах. */
export function change(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export interface DayCounts {
  adLeads: number;
  organicLeads: number;
  directUnknownLeads: number;
  otherLeads: number;
  repeats: number;
  withPhone: number;
  sales: number;
  salesAmountMinor: number;
}

export const EMPTY_COUNTS: DayCounts = {
  adLeads: 0,
  organicLeads: 0,
  directUnknownLeads: 0,
  otherLeads: 0,
  repeats: 0,
  withPhone: 0,
  sales: 0,
  salesAmountMinor: 0,
};

export function sumCounts(rows: DayCounts[]): DayCounts {
  return rows.reduce(
    (a, r) => ({
      adLeads: a.adLeads + r.adLeads,
      organicLeads: a.organicLeads + r.organicLeads,
      directUnknownLeads: a.directUnknownLeads + r.directUnknownLeads,
      otherLeads: a.otherLeads + r.otherLeads,
      repeats: a.repeats + r.repeats,
      withPhone: a.withPhone + r.withPhone,
      sales: a.sales + r.sales,
      salesAmountMinor: a.salesAmountMinor + r.salesAmountMinor,
    }),
    EMPTY_COUNTS,
  );
}

export function totalLeads(c: DayCounts): number {
  return c.adLeads + c.organicLeads + c.directUnknownLeads + c.otherLeads;
}
