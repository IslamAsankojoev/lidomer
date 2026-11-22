import {
  DELIVERY_CHANNEL_LABELS,
  DELIVERY_CHANNELS,
  type DeliveryChannel,
  type ReportTarget,
} from '@lidomer/shared';
import { Fragment } from 'react';
import { SourceBadge } from '@/components/source-badge';

/** Ключ получателя: канал, чат и тема. */
export const targetKey = (r: {
  channel: DeliveryChannel;
  chatId: string;
  threadId: string | null;
}) => `${r.channel}|${r.chatId}|${r.threadId ?? ''}`;

/** «Группа › Тема» или «Группа». */
export const targetLabel = (t: ReportTarget) =>
  t.topicTitle ? `${t.chatTitle} › ${t.topicTitle}` : t.chatTitle;

/** «[лого] Telegram 2 · [лого] WhatsApp 1» (в списке) или «… Telegram — 2, … WhatsApp — 1» (в проверке). */
export function ChannelCounts({
  recipients,
  style = 'list',
}: {
  recipients: { channel: DeliveryChannel }[];
  style?: 'list' | 'summary';
}) {
  const parts = DELIVERY_CHANNELS.flatMap((ch) => {
    const n = recipients.filter((r) => r.channel === ch).length;
    return n ? [{ ch, n }] : [];
  });
  if (!parts.length) return <>нет получателей</>;
  return parts.map(({ ch, n }, i) => (
    <Fragment key={ch}>
      {i > 0 && (style === 'list' ? ' · ' : ', ')}
      <SourceBadge source={ch}>
        {DELIVERY_CHANNEL_LABELS[ch]} {style === 'list' ? n : `— ${n}`}
      </SourceBadge>
    </Fragment>
  ));
}
