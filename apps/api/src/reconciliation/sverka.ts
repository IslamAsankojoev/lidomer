/**
 * Ручная сверка (ТЗ, Этап 6): таблица маркетолога за каждый день против цифр кабинета.
 * Пустая ячейка — «не сверяли», а не ноль: такое поле не сравнивается.
 */

/** Колонки шаблона docs/setup/sverka-template.csv. */
export const SVERKA_FIELDS = {
  spend: 'расход',
  ad: 'реклама',
  organic: 'органика',
  direct: 'direct',
  other: 'другие',
  sales: 'продажи',
} as const;
export type SverkaField = keyof typeof SVERKA_FIELDS;

export interface ManualDay {
  day: string;
  values: Partial<Record<SverkaField, number>>;
  note: string;
}

/** Цифры кабинета за день; расход — в основных единицах валюты кабинета, null — нет данных. */
export type CabinetDay = Record<Exclude<SverkaField, 'spend'>, number> & {
  day: string;
  spend: number | null;
};

export interface SverkaDiff {
  day: string;
  field: SverkaField;
  manual: number;
  cabinet: number | null;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** «1 234,50» → 1234.5; пусто → undefined. */
function parseNumber(raw: string): number | undefined {
  const s = raw.replace(/[\s\u00a0]/g, '').replace(',', '.');
  if (!s) return undefined;
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error(`Не число: «${raw}»`);
  return n;
}

/** Excel в русской локали сохраняет CSV через «;», Google Таблицы — через «,». */
export function parseSverkaCsv(text: string): ManualDay[] {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim());
  if (!lines.length) return [];
  const sep = lines[0]!.includes(';') ? ';' : ',';
  const header = lines[0]!.split(sep).map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  if (col('день') < 0) throw new Error('В таблице нет колонки «день»');
  return lines.slice(1).map((line, i) => {
    const cells = line.split(sep);
    const cell = (name: string) => (col(name) >= 0 ? (cells[col(name)] ?? '').trim() : '');
    const day = cell('день');
    if (!DAY.test(day)) throw new Error(`Строка ${i + 2}: день «${day}» не в формате ГГГГ-ММ-ДД`);
    const values: ManualDay['values'] = {};
    for (const [field, name] of Object.entries(SVERKA_FIELDS) as [SverkaField, string][]) {
      const n = parseNumber(cell(name));
      if (n !== undefined) values[field] = n;
    }
    return { day, values, note: cell('комментарий') };
  });
}

/** Лиды и продажи — точно; расход — с допуском 1 % (округление Meta), но не меньше 0,01. */
export function compareSverka(manual: ManualDay[], cabinet: CabinetDay[]): SverkaDiff[] {
  const byDay = new Map(cabinet.map((c) => [c.day, c]));
  const diffs: SverkaDiff[] = [];
  for (const m of manual) {
    const c = byDay.get(m.day);
    for (const [field, value] of Object.entries(m.values) as [SverkaField, number][]) {
      const got = c ? c[field] : null;
      const same =
        got !== null &&
        (field === 'spend'
          ? Math.abs(got - value) <= Math.max(0.01, Math.abs(value) * 0.01)
          : got === value);
      if (!same) diffs.push({ day: m.day, field, manual: value, cabinet: got });
    }
  }
  return diffs;
}
