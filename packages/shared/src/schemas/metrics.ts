import { z } from 'zod';
import { dealStatusSchema, integrationStatusSchema, integrationTypeSchema } from '../integrations';
import { countingSettingsSchema, leadChannelSchema, leadFlagSchema } from '../leads';
import { dayKeySchema } from '../period';

const nullableInt = z.number().int().nullable();

/** Свежесть источника: когда обновлялся и в каком состоянии. */
export const sourceFreshnessSchema = z.object({
  type: integrationTypeSchema,
  status: integrationStatusSchema,
  lastSyncAt: z.string().nullable(),
});

export const countsSchema = z.object({
  adLeads: z.number().int(),
  organicLeads: z.number().int(),
  directUnknownLeads: z.number().int(),
  otherLeads: z.number().int(),
  totalLeads: z.number().int(),
  repeats: z.number().int(),
  withPhone: z.number().int(),
  sales: z.number().int(),
  salesAmountMinor: z.number().int(),
  /** Расход Meta в валюте кабинета; null — нет данных с Meta. */
  spendMinor: nullableInt,
  spendCurrency: z.string().nullable(),
  /** Лиды по данным Meta; null — нет данных. */
  metaLeads: nullableInt,
  /** Цена за рекламный лид (факт / Meta); null — нет данных. */
  cplFactMinor: nullableInt,
  cplMetaMinor: nullableInt,
});
export type Counts = z.infer<typeof countsSchema>;

export const summaryResponseSchema = z.object({
  period: z.object({ from: dayKeySchema, to: dayKeySchema }),
  previous: z.object({ from: dayKeySchema, to: dayKeySchema }),
  current: countsSchema,
  before: countsSchema,
  /** Курс доллара к сому на конец периода — для «≈ … сом». */
  fx: z.object({ rate: z.number(), source: z.string(), day: z.string() }).nullable(),
  sources: z.array(sourceFreshnessSchema),
  /** Дни периода, по которым данные ещё могут измениться (последние 7). */
  preliminaryFrom: dayKeySchema.nullable(),
});
export type SummaryResponse = z.infer<typeof summaryResponseSchema>;

export const dailyPointSchema = z.object({
  day: dayKeySchema,
  adLeads: z.number().int(),
  organicLeads: z.number().int(),
  directUnknownLeads: z.number().int(),
  otherLeads: z.number().int(),
  sales: z.number().int(),
  spendMinor: nullableInt,
});
export const dailyResponseSchema = z.object({ points: z.array(dailyPointSchema) });

/** Метрика, у которой можно раскрыть «из чего сложилось» — список лидов. */
export const LEAD_METRICS = [
  'adLeads',
  'organicLeads',
  'directUnknownLeads',
  'otherLeads',
  'totalLeads',
  'repeats',
  'withPhone',
  'sales',
] as const;
export const leadMetricSchema = z.enum(LEAD_METRICS);
export type LeadMetric = z.infer<typeof leadMetricSchema>;

export const leadsQuerySchema = z.object({
  from: dayKeySchema,
  to: dayKeySchema,
  metric: leadMetricSchema.optional(),
  channel: leadChannelSchema.optional(),
  status: dealStatusSchema.optional(),
  flag: leadFlagSchema.optional(),
  hasPhone: z.enum(['yes', 'no']).optional(),
  adKey: z.string().optional(),
  includeRepeats: z.enum(['yes', 'no']).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type LeadsQuery = z.infer<typeof leadsQuerySchema>;

export const leadItemSchema = z.object({
  id: z.string(),
  origin: z.enum(['ward', 'b24']),
  createdAt: z.string(),
  day: dayKeySchema,
  name: z.string().nullable(),
  /** Наблюдатель видит телефон в маске. */
  phone: z.string().nullable(),
  instagram: z.string().nullable(),
  channel: leadChannelSchema,
  adKey: z.string().nullable(),
  adName: z.string().nullable(),
  campaignName: z.string().nullable(),
  adsetName: z.string().nullable(),
  postId: z.string().nullable(),
  wardLeadId: z.number().nullable(),
  dealId: z.string().nullable(),
  stageName: z.string().nullable(),
  status: dealStatusSchema,
  amountMinor: nullableInt,
  currency: z.string().nullable(),
  isRepeat: z.boolean(),
  repeatOf: z.string().nullable(),
  flags: z.array(leadFlagSchema),
});
export type LeadItem = z.infer<typeof leadItemSchema>;

export const leadsResponseSchema = z.object({
  items: z.array(leadItemSchema),
  total: z.number().int(),
});

export const createOverrideRequestSchema = z.object({
  field: z.enum(['channel', 'status', 'excluded']),
  value: z.union([leadChannelSchema, dealStatusSchema, z.boolean()]),
  reason: z.string().trim().min(3, 'Опишите причину'),
});
export type CreateOverrideRequest = z.infer<typeof createOverrideRequestSchema>;

export const bitrixSourceSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Сделок за последние 30 дней. */
  deals30d: z.number().int(),
  withUtm30d: z.number().int(),
});
export const countingResponseSchema = z.object({
  settings: countingSettingsSchema,
  bitrixSources: z.array(bitrixSourceSchema),
});
export type CountingResponse = z.infer<typeof countingResponseSchema>;
