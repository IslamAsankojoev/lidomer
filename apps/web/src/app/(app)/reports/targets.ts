import {
  DELIVERY_CHANNEL_LABELS,
  DELIVERY_CHANNELS,
  type DeliveryChannel,
  type ReportTarget,
} from '@lidomer/shared';

/** Ключ получателя: канал, чат и тема. */
export const targetKey = (r: {
  channel: DeliveryChannel;
  chatId: string;
  threadId: string | null;
}) => `${r.channel}|${r.chatId}|${r.threadId ?? ''}`;

/** «Группа › Тема» или «Группа». */
export const targetLabel = (t: ReportTarget) =>
  t.topicTitle ? `${t.chatTitle} › ${t.topicTitle}` : t.chatTitle;

/** «Telegram 2 · WhatsApp 1» (в списке) или «Telegram — 2, WhatsApp — 1» (в проверке). */
export function channelCounts(
  recipients: { channel: DeliveryChannel }[],
  style: 'list' | 'summary' = 'list',
): string {
  const parts = DELIVERY_CHANNELS.flatMap((ch) => {
    const n = recipients.filter((r) => r.channel === ch).length;
    const label = DELIVERY_CHANNEL_LABELS[ch];
    return n ? [style === 'list' ? `${label} ${n}` : `${label} — ${n}`] : [];
  });
  return parts.join(style === 'list' ? ' · ' : ', ') || 'нет получателей';
}
