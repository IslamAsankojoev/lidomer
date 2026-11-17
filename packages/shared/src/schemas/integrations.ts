import { z } from 'zod';
import {
  dealStatusSchema,
  integrationStatusSchema,
  integrationTypeSchema,
  syncRunStatusSchema,
} from '../integrations';

export const integrationSummarySchema = z.object({
  type: integrationTypeSchema,
  name: z.string(),
  status: integrationStatusSchema,
  lastSyncAt: z.string().nullable(),
  lastError: z.string().nullable(),
  /** Ключи только маской: «wdr_…1234». */
  maskedSecrets: z.record(z.string(), z.string()),
  /** Что показать в карточке: аккаунт, портал, число лидов. */
  details: z.record(z.string(), z.string()),
  /** Предупреждения, например часовой пояс аккаунта не Asia/Bishkek. */
  warnings: z.array(z.string()),
  /** Сколько задач синхронизации ждёт в очереди. */
  pendingJobs: z.number().int(),
});
export type IntegrationSummary = z.infer<typeof integrationSummarySchema>;

export const integrationsResponseSchema = z.object({
  integrations: z.array(integrationSummarySchema),
});

export const syncRunSummarySchema = z.object({
  id: z.number(),
  job: z.string(),
  periodFrom: z.string().nullable(),
  periodTo: z.string().nullable(),
  status: syncRunStatusSchema,
  records: z.number(),
  error: z.string().nullable(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
});
export type SyncRunSummary = z.infer<typeof syncRunSummarySchema>;

export const syncRunsResponseSchema = z.object({ runs: z.array(syncRunSummarySchema) });

/** Ключи для подключения. Значения уходят только в api и хранятся зашифрованными. */
export const connectWardRequestSchema = z.object({
  apiKey: z.string().min(1, 'Вставьте ключ WARD'),
});
export const connectBitrix24RequestSchema = z.object({
  webhookUrl: z.string().min(1, 'Вставьте адрес вебхука'),
});
export const connectMetaRequestSchema = z.object({
  /** Код из Facebook Login for Business. */
  code: z.string().min(1),
});

export const b24StageSchema = z.object({
  stageId: z.string(),
  categoryId: z.number(),
  categoryName: z.string().nullable(),
  name: z.string(),
  semantics: z.enum(['process', 'success', 'failure']),
  /** Выбор владельца; null — действует статус по умолчанию. */
  mappedStatus: dealStatusSchema.nullable(),
  /** Итоговый статус: выбор владельца или по семантике Bitrix24. */
  status: dealStatusSchema,
  deals: z.number().int(),
});
export type B24Stage = z.infer<typeof b24StageSchema>;

export const b24StagesResponseSchema = z.object({ stages: z.array(b24StageSchema) });

export const updateStageMapRequestSchema = z.object({
  mappings: z
    .array(z.object({ stageId: z.string().min(1), status: dealStatusSchema.nullable() }))
    .min(1)
    .max(500),
});
export type UpdateStageMapRequest = z.infer<typeof updateStageMapRequestSchema>;
