import { z } from 'zod';
import { reportConfigSchema, reportScheduleSchema, reportTemplateSchema } from '../reports';

export const recipientSchema = z.object({
  chatId: z.string(),
  threadId: z.string().nullable(),
});
export type Recipient = z.infer<typeof recipientSchema>;

export const reportInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  template: reportTemplateSchema,
  config: reportConfigSchema,
  schedule: reportScheduleSchema,
  recipients: z.array(recipientSchema).max(20),
  enabled: z.boolean(),
});
export type ReportInput = z.infer<typeof reportInputSchema>;

export const reportSchema = reportInputSchema.extend({
  id: z.uuid(),
  lastRun: z
    .object({
      id: z.uuid(),
      status: z.string(),
      scheduledFor: z.string(),
      sentAt: z.string().nullable(),
    })
    .nullable(),
  /** Следующая отправка (UTC); null — расписание выключено. */
  nextRunAt: z.string().nullable(),
});
export type ReportDto = z.infer<typeof reportSchema>;
export const reportsResponseSchema = z.object({ reports: z.array(reportSchema) });

export const telegramChatSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.string(),
  isForum: z.boolean(),
  topics: z.array(z.object({ id: z.string(), name: z.string() })),
  active: z.boolean(),
});
export type TelegramChatDto = z.infer<typeof telegramChatSchema>;
export const telegramChatsResponseSchema = z.object({
  chats: z.array(telegramChatSchema),
  /** Команда для привязки группы: «/connect КОД». */
  connectCode: z.string(),
  botUsername: z.string().nullable(),
  /** Бот не настроен (нет TELEGRAM_BOT_TOKEN). */
  configured: z.boolean(),
  alertChatId: z.string().nullable(),
});

export const deliverySchema = z.object({
  chatId: z.string(),
  threadId: z.string().nullable(),
  ok: z.boolean(),
  error: z.string().nullable(),
});

export const reportRunSchema = z.object({
  id: z.uuid(),
  reportId: z.uuid(),
  scheduledFor: z.string(),
  isTest: z.boolean(),
  status: z.enum(['pending', 'waiting_data', 'sent', 'partial', 'failed']),
  caption: z.string().nullable(),
  dataNote: z.string().nullable(),
  imageUrl: z.string().nullable(),
  deliveries: z.array(deliverySchema),
  error: z.string().nullable(),
  sentAt: z.string().nullable(),
});
export type ReportRunDto = z.infer<typeof reportRunSchema>;
export const reportRunsResponseSchema = z.object({ runs: z.array(reportRunSchema) });

/** Снимок цифр запуска: по нему рисуется картинка и пишется подпись. */
export const reportSnapshotSchema = z.object({
  workspaceName: z.string(),
  reportName: z.string(),
  period: z.object({ from: z.string(), to: z.string() }),
  generatedAt: z.string(),
  timezone: z.string(),
  blocks: z.array(z.string()),
  current: z.record(z.string(), z.number().nullable()),
  before: z.record(z.string(), z.number().nullable()),
  spendCurrency: z.string().nullable(),
  fxRate: z.number().nullable(),
  creatives: z.array(
    z.object({
      title: z.string(),
      subtitle: z.string().nullable(),
      leads: z.number(),
      sales: z.number(),
      previewUrl: z.string().nullable(),
    }),
  ),
  funnel: z
    .object({
      conversations: z.number(),
      wardLeads: z.number(),
      withDeal: z.number(),
      sales: z.number(),
    })
    .nullable(),
  sources: z.array(z.object({ name: z.string(), at: z.string().nullable(), ok: z.boolean() })),
  dataNote: z.string().nullable(),
});
export type ReportSnapshot = z.infer<typeof reportSnapshotSchema>;
