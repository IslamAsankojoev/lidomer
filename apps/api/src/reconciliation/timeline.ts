import { type LeadItem, normalizeStageSemantics } from '@lidomer/shared';

export interface TimelineEvent {
  at: string;
  kind: 'ad' | 'ward_lead' | 'deal_created' | 'deal_updated' | 'deal_closed' | 'override';
  title: string;
  details: string | null;
}

interface Sources {
  ward: {
    createdAt: Date;
    sourceText: string | null;
    status: string | null;
    adTitle: string | null;
  } | null;
  deal: {
    title: string | null;
    createdAt: Date | null;
    updatedAt: Date | null;
    closedAt: Date | null;
    stageName: string | null;
    semantics: string | null;
  } | null;
}

/** Хронология «объявление → Ward → сделка» по данным источников и ручным правкам. */
export function buildTimeline(
  item: LeadItem,
  src: Sources,
  overrides: {
    field: string;
    value: unknown;
    reason: string;
    createdAt: string;
    revokedAt: string | null;
  }[],
): TimelineEvent[] {
  const ev: TimelineEvent[] = [];
  const adText =
    item.channel === 'ad'
      ? [item.campaignName, item.adsetName, item.adName].filter(Boolean).join(' › ') ||
        (item.adKey ?? null)
      : null;

  if (src.ward) {
    ev.push({
      at: src.ward.createdAt.toISOString(),
      kind: 'ward_lead',
      title: 'Написал в Instagram — лид Ward',
      details:
        [src.ward.sourceText, adText && `объявление: ${adText}`].filter(Boolean).join(' · ') ||
        null,
    });
  } else if (adText) {
    ev.push({ at: item.createdAt, kind: 'ad', title: 'Заявка с рекламы', details: adText });
  }

  if (src.deal?.createdAt) {
    ev.push({
      at: src.deal.createdAt.toISOString(),
      kind: 'deal_created',
      title: `Сделка №${item.dealId} в Bitrix24`,
      details: src.deal.title,
    });
    const sem = normalizeStageSemantics(src.deal.semantics);
    if (src.deal.closedAt && sem !== 'process') {
      ev.push({
        at: src.deal.closedAt.toISOString(),
        kind: 'deal_closed',
        title: sem === 'success' ? 'Продажа' : 'Отказ',
        details: src.deal.stageName,
      });
    } else if (
      src.deal.updatedAt &&
      src.deal.updatedAt.getTime() - src.deal.createdAt.getTime() > 60_000
    ) {
      ev.push({
        at: src.deal.updatedAt.toISOString(),
        kind: 'deal_updated',
        title: 'Сделка обновлена',
        details: src.deal.stageName ? `стадия: ${src.deal.stageName}` : null,
      });
    }
  } else if (item.origin === 'ward') {
    ev.push({
      at: item.createdAt,
      kind: 'deal_created',
      title: 'Сделки в Bitrix24 нет',
      details: 'Лид не дошёл до CRM',
    });
  }

  for (const o of overrides) {
    ev.push({
      at: o.createdAt,
      kind: 'override',
      title: `Ручная правка: ${o.field}${o.revokedAt ? ' (отменена)' : ''}`,
      details: `${JSON.stringify(o.value)} — ${o.reason}`,
    });
  }
  return ev.sort((a, b) => a.at.localeCompare(b.at));
}
