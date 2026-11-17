'use client';

import {
  DEAL_STATUS_LABELS,
  LEAD_CHANNEL_LABELS,
  LEAD_FLAG_LABELS,
  type LeadItem,
  toMajor,
} from '@lidomer/shared';

const COLUMNS: { title: string; value: (l: LeadItem) => string | number | null }[] = [
  { title: 'Дата', value: (l) => l.createdAt.slice(0, 19).replace('T', ' ') },
  { title: 'День', value: (l) => l.day },
  { title: 'Имя', value: (l) => l.name },
  { title: 'Телефон', value: (l) => l.phone },
  { title: 'Instagram', value: (l) => l.instagram },
  { title: 'Канал', value: (l) => LEAD_CHANNEL_LABELS[l.channel] },
  { title: 'Источник', value: (l) => (l.origin === 'ward' ? 'WARD' : 'Bitrix24') },
  { title: 'Кампания', value: (l) => l.campaignName },
  { title: 'Группа', value: (l) => l.adsetName },
  { title: 'Объявление', value: (l) => l.adName ?? l.adKey },
  { title: 'Сделка', value: (l) => l.dealId },
  { title: 'Стадия', value: (l) => l.stageName },
  { title: 'Статус', value: (l) => DEAL_STATUS_LABELS[l.status] },
  {
    title: 'Сумма',
    value: (l) =>
      l.amountMinor !== null && l.currency
        ? toMajor({ amountMinor: l.amountMinor, currency: l.currency })
        : null,
  },
  { title: 'Валюта', value: (l) => l.currency },
  { title: 'Повтор', value: (l) => (l.isRepeat ? 'да' : '') },
  { title: 'Проблемы', value: (l) => l.flags.map((f) => LEAD_FLAG_LABELS[f]).join('; ') },
];

function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** CSV с BOM — открывается в Excel с кириллицей. */
export function exportCsv(leads: LeadItem[], name: string) {
  const esc = (v: string | number | null) => {
    const s = v === null ? '' : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [COLUMNS.map((c) => c.title), ...leads.map((l) => COLUMNS.map((c) => c.value(l)))];
  const csv = lines.map((r) => r.map(esc).join(';')).join('\r\n');
  download(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }), `${name}.csv`);
}

/** Настоящий .xlsx. Библиотека грузится только по кнопке. */
export async function exportXlsx(leads: LeadItem[], name: string) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const rows = [
    COLUMNS.map((c) => ({ value: c.title, fontWeight: 'bold' as const })),
    ...leads.map((l) => COLUMNS.map((c) => ({ value: c.value(l) ?? undefined }))),
  ];
  const blob = await writeXlsxFile(rows as never).toBlob();
  download(blob, `${name}.xlsx`);
}
