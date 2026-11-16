import { z } from 'zod';

/** Канал лида после сверки. */
export const LEAD_CHANNELS = ['ad', 'organic', 'direct_unknown', 'other'] as const;
export const leadChannelSchema = z.enum(LEAD_CHANNELS);
export type LeadChannel = z.infer<typeof leadChannelSchema>;

export const LEAD_CHANNEL_LABELS: Record<LeadChannel, string> = {
  ad: 'Реклама',
  organic: 'Органика',
  direct_unknown: 'Direct, источник не определён',
  other: 'Другой канал',
};

/** Флаги проблем лида. */
export const LEAD_FLAGS = [
  'no_deal',
  'no_phone',
  'ad_label_without_lead',
  'ad_not_connected',
  'source_unparsed',
] as const;
export const leadFlagSchema = z.enum(LEAD_FLAGS);
export type LeadFlag = z.infer<typeof leadFlagSchema>;

export const LEAD_FLAG_LABELS: Record<LeadFlag, string> = {
  no_deal: 'Лид не дошёл до Bitrix24',
  no_phone: 'Без телефона',
  ad_label_without_lead: 'Сделка с рекламной меткой без лида Ward',
  ad_not_connected: 'Объявление из неподключённого кабинета',
  source_unparsed: 'Источник не разобран',
};

/** Источники Bitrix24, UTM которых означает рекламу Meta. */
const AD_UTM_SOURCES = new Set(['ig', 'fb', 'facebook', 'instagram', 'an', 'msg', 'meta']);

/** Рекламная ли сделка по UTM: ig/fb и не organic. */
export function isAdUtm(
  utmSource: string | null | undefined,
  utmMedium: string | null | undefined,
): boolean {
  if (!utmSource) return false;
  if (!AD_UTM_SOURCES.has(utmSource.trim().toLowerCase())) return false;
  return (utmMedium ?? '').trim().toLowerCase() !== 'organic';
}

/**
 * Телефон к одному виду `+996XXXXXXXXX` для сравнения людей. Не телефон — null.
 * Кыргызские номера: 0XXXXXXXXX и XXXXXXXXX (9 цифр) → +996…; остальные — как есть с «+».
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, '');
  if (d.length === 10 && d.startsWith('0')) d = `996${d.slice(1)}`;
  else if (d.length === 9) d = `996${d}`;
  if (d.length < 10 || d.length > 15) return null;
  return `+${d}`;
}

/** «@User_Name » → «user_name». */
export function normalizeInstagram(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim().replace(/^@/, '').toLowerCase();
  return v || null;
}

/** «+996555123456» → «+996 *** *** 456» — для Наблюдателя и отчётов в мессенджер. */
export function maskPhone(phone: string | null): string | null {
  if (!phone) return null;
  return `${phone.slice(0, 4)} *** *** ${phone.slice(-3)}`;
}

/** Правила подсчёта компании (Настройки). */
export const countingSettingsSchema = z.object({
  /** Окно повторного обращения, дней. */
  duplicateWindowDays: z.number().int().min(0).max(365).default(30),
  /** SOURCE_ID Bitrix24, которые считаются рекламой даже без UTM. */
  adSourceIds: z.array(z.string()).default([]),
  /** SOURCE_ID Bitrix24, сделки которых не считаются лидами (например, импорт старой базы). */
  excludedSourceIds: z.array(z.string()).default([]),
  /** Главная цифра лидов: факт (CRM) или по данным Meta. */
  headline: z.enum(['fact', 'meta']).default('fact'),
});
export type CountingSettings = z.infer<typeof countingSettingsSchema>;
export const DEFAULT_COUNTING: CountingSettings = countingSettingsSchema.parse({});
