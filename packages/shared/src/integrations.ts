import { z } from 'zod';

/** Типы подключений. */
export const INTEGRATION_TYPES = ['meta_ads', 'ward', 'bitrix24', 'telegram'] as const;
export const integrationTypeSchema = z.enum(INTEGRATION_TYPES);
export type IntegrationType = z.infer<typeof integrationTypeSchema>;

export const INTEGRATION_LABELS: Record<IntegrationType, string> = {
  meta_ads: 'Meta Ads',
  ward: 'Ward',
  bitrix24: 'Bitrix24',
  telegram: 'Telegram',
};

/** Состояние подключения. */
export const INTEGRATION_STATUSES = [
  'not_connected',
  'connected',
  'syncing',
  'error',
  'reauth_required',
  'disabled',
] as const;
export const integrationStatusSchema = z.enum(INTEGRATION_STATUSES);
export type IntegrationStatus = z.infer<typeof integrationStatusSchema>;

export const INTEGRATION_STATUS_LABELS: Record<IntegrationStatus, string> = {
  not_connected: 'Не подключено',
  connected: 'Подключено',
  syncing: 'Синхронизация',
  error: 'Ошибка',
  reauth_required: 'Нужно переподключить',
  disabled: 'Отключено',
};

export const SYNC_RUN_STATUSES = ['running', 'success', 'error'] as const;
export const syncRunStatusSchema = z.enum(SYNC_RUN_STATUSES);
export type SyncRunStatus = z.infer<typeof syncRunStatusSchema>;

/** Статус лида/сделки после сопоставления стадий Bitrix24. */
export const DEAL_STATUSES = ['in_work', 'won', 'lost'] as const;
export const dealStatusSchema = z.enum(DEAL_STATUSES);
export type DealStatus = z.infer<typeof dealStatusSchema>;
