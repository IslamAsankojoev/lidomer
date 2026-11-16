/**
 * Деньги хранятся целыми числами в минимальных единицах (центы, тыйыны) вместе с кодом валюты.
 * Сколько знаков после запятой у валюты — берём из Intl, а не угадываем.
 */
export interface Money {
  amountMinor: number;
  currency: string;
}

export function currencyDigits(currency: string): number {
  return (
    new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits ?? 2
  );
}

export function toMajor({ amountMinor, currency }: Money): number {
  return amountMinor / 10 ** currencyDigits(currency);
}

/** «$1 234,50» — главная сумма в валюте кабинета. */
export function formatMoney(money: Money, locale = 'ru-RU'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: money.currency }).format(
    toMajor(money),
  );
}

/** «≈ 107 800 сом» — справочная сумма в сомах, всегда со знаком ≈ и без копеек. */
export function formatApproxSom(amountSom: number, locale = 'ru-RU'): string {
  return `≈ ${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(amountSom)} сом`;
}
