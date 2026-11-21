import { z } from 'zod';
import { integrationStatusSchema } from '../integrations';
import {
  deliveryChannelSchema,
  reportConfigSchema,
  reportScheduleSchema,
  reportTemplateSchema,
} from '../reports';

/** Получатель отчёта: канал и чат. У WhatsApp тем нет — threadId всегда null. */
export const recipientSchema = z
  .object({
    // У получателей, сохранённых до WhatsApp, канала нет — это Telegram.
    channel: deliveryChannelSchema.default('telegram'),
    chatId: z.string().min(1),
    threadId: z.string().nullable(),
  })
  .refine((r) => r.channel !== 'green_api' || r.threadId === null, {
    message: 'У групп WhatsApp нет тем',
    path: ['threadId'],
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
  // Доставки до WhatsApp — все в Telegram.
  channel: deliveryChannelSchema.default('telegram'),
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
  pdfUrl: z.string().nullable(),
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
      /** null — нет данных Meta по объявлению (не ноль). Старые снимки поля не имеют. */
      spendMinor: z.number().nullable().default(null),
      cplMinor: z.number().nullable().default(null),
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
  /** Email того, кто запланировал отчёт, пока он в команде компании. */
  marketer: z.string().nullable().default(null),
});
export type ReportSnapshot = z.infer<typeof reportSnapshotSchema>;

/** Предпросмотр отчёта в конструкторе: те же цифры, картинка и подпись, что уйдут в Telegram. */
export const reportPreviewRequestSchema = reportInputSchema.pick({ name: true, config: true });
export type ReportPreviewRequest = z.infer<typeof reportPreviewRequestSchema>;
export const reportPreviewResponseSchema = z.object({
  snapshot: reportSnapshotSchema,
  caption: z.string(),
});
export type ReportPreviewResponse = z.infer<typeof reportPreviewResponseSchema>;

/** Хост Green API из консоли: только https на green-api.com / greenapi.com, без пути и порта. */
const GREEN_HOST_RE = /^([a-z0-9-]+\.)*(green-api|greenapi)\.com$/i;
const GREEN_HOST_MESSAGE = 'Адрес из консоли Green API, например https://1234.api.greenapi.com';
export const greenApiHostSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/\/+$/, ''))
  .refine((v) => {
    let u: URL;
    try {
      u = new URL(v);
    } catch {
      return false;
    }
    return (
      u.protocol === 'https:' &&
      !u.username &&
      !u.password &&
      !u.port &&
      u.pathname === '/' &&
      !u.search &&
      !u.hash &&
      // Без лишнего в исходной строке: URL сам «съедает» пустые ? и #.
      v.toLowerCase() === `https://${u.hostname}` &&
      GREEN_HOST_RE.test(u.hostname)
    );
  }, GREEN_HOST_MESSAGE);

export const connectGreenApiRequestSchema = z.object({
  apiUrl: greenApiHostSchema,
  mediaUrl: greenApiHostSchema,
  idInstance: z
    .string()
    .trim()
    .regex(/^\d{4,20}$/, 'idInstance — число из консоли Green API'),
  apiTokenInstance: z.string().trim().min(20, 'apiTokenInstance — длинный токен из консоли'),
});
export type ConnectGreenApiRequest = z.infer<typeof connectGreenApiRequestSchema>;

export const whatsappGroupSchema = z.object({ id: z.string(), name: z.string() });
export type WhatsappGroup = z.infer<typeof whatsappGroupSchema>;

export const whatsappStatusSchema = z.object({
  status: integrationStatusSchema,
  state: z.string().nullable(),
  phone: z.string().nullable(),
  idInstance: z.string().nullable(),
  maskedToken: z.string().nullable(),
  groups: z.array(whatsappGroupSchema),
  groupsUpdatedAt: z.string().nullable(),
  lastError: z.string().nullable(),
});
export type WhatsappStatus = z.infer<typeof whatsappStatusSchema>;

/** Куда можно отправить отчёт — группы и темы Telegram и группы WhatsApp одним списком. */
export const reportTargetSchema = z.object({
  channel: deliveryChannelSchema,
  chatId: z.string(),
  threadId: z.string().nullable(),
  chatTitle: z.string(),
  topicTitle: z.string().nullable(),
  active: z.boolean(),
});
export type ReportTarget = z.infer<typeof reportTargetSchema>;
export const reportTargetsResponseSchema = z.object({
  telegram: z.object({ configured: z.boolean() }),
  whatsapp: z.object({ status: integrationStatusSchema }),
  targets: z.array(reportTargetSchema),
});
export type ReportTargetsResponse = z.infer<typeof reportTargetsResponseSchema>;
