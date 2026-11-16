import { formatApproxSom, formatMoney, toMajor } from '@lidomer/shared';

/** «$1 234» — сумма в валюте; null — нет данных. */
export function money(minor: number | null, currency: string | null): string | null {
  if (minor === null || !currency) return null;
  return formatMoney({ amountMinor: minor, currency });
}

/** «≈ 107 800 сом» по курсу; без курса — null. */
export function approxSom(
  minor: number | null,
  currency: string | null,
  rate: number | null,
): string | null {
  if (minor === null || !currency || !rate) return null;
  return formatApproxSom(toMajor({ amountMinor: minor, currency }) * rate);
}

export const int = (n: number) => new Intl.NumberFormat('ru-RU').format(n);
