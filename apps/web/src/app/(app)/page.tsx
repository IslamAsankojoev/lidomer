'use client';

import {
  change,
  type Counts,
  INTEGRATION_LABELS,
  INTEGRATION_STATUS_LABELS,
  type LeadMetric,
  summaryResponseSchema,
} from '@lidomer/shared';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { formatPeriod } from '@/components/period-bar';
import { ErrorState, LoadingState } from '@/components/state';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useApi } from '@/lib/api';
import { approxSom, int, money } from '@/lib/format';
import { usePeriod } from '@/lib/period';
import { usePeriodHref } from '@/lib/period-link';
import { useWorkspace } from '@/lib/workspace';
import { cn } from '@/lib/utils';

interface Tile {
  label: string;
  hint: string;
  metric?: LeadMetric;
  value: (c: Counts) => number | null;
  format?: (n: number, c: Counts) => string;
}

const TILES: Tile[] = [
  {
    label: 'Лиды с рекламы · факт',
    hint: 'Лиды Ward с объявлением + сделки Bitrix24 с рекламными UTM или из рекламных источников. Повторы не входят.',
    metric: 'adLeads',
    value: (c) => c.adLeads,
  },
  {
    label: 'Цена за лид · факт',
    hint: 'Расход Meta ÷ лиды с рекламы. Органика не входит.',
    value: (c) => c.cplFactMinor,
    format: (n, c) => money(n, c.spendCurrency) ?? '—',
  },
  {
    label: 'Расход',
    hint: 'Расход по данным Meta Ads в валюте кабинета.',
    value: (c) => c.spendMinor,
    format: (n, c) => money(n, c.spendCurrency) ?? '—',
  },
  {
    label: 'Органика',
    hint: 'Комментарии под постами без рекламы (Ward).',
    metric: 'organicLeads',
    value: (c) => c.organicLeads,
  },
  {
    label: 'Direct, источник не определён',
    hint: 'Ward отдаёт Direct без пометки рекламы — пока не относим ни к рекламе, ни к органике.',
    metric: 'directUnknownLeads',
    value: (c) => c.directUnknownLeads,
  },
  {
    label: 'Другие каналы',
    hint: 'Сделки Bitrix24 без рекламных UTM: Albato, лид-формы без UTM, WhatsApp и т. д. Настраивается в «Настройках».',
    metric: 'otherLeads',
    value: (c) => c.otherLeads,
  },
  {
    label: 'С телефоном',
    hint: 'Новые лиды, у которых есть телефон.',
    metric: 'withPhone',
    value: (c) => c.withPhone,
  },
  {
    label: 'Продажи',
    hint: 'Сделки на стадиях со статусом «Продажа» (Интеграции → Bitrix24 → Статусы сделок).',
    metric: 'sales',
    value: (c) => c.sales,
  },
  {
    label: 'Повторные обращения',
    hint: 'Тот же Instagram или телефон в окне 30 дней.',
    metric: 'repeats',
    value: (c) => c.repeats,
  },
];

export default function OverviewPage() {
  const api = useApi();
  const { workspace } = useWorkspace();
  const { range } = usePeriod();
  const href = usePeriodHref();
  const q = useQuery({
    queryKey: ['summary', workspace.id, range],
    queryFn: () =>
      api(summaryResponseSchema, `/metrics/summary?from=${range.from}&to=${range.to}`, {
        workspaceId: workspace.id,
      }),
  });

  return (
    <>
      <PageHeader
        title="Обзор"
        description={`${workspace.name} · ${formatPeriod(range)} · дни по ${workspace.timezone}`}
      />
      {q.isPending ? (
        <LoadingState rows={3} />
      ) : q.isError ? (
        <ErrorState message={q.error.message} onRetry={() => void q.refetch()} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {TILES.map((t) => {
              const value = t.value(q.data.current);
              const prev = t.value(q.data.before);
              const delta = change(value, prev);
              const noMeta = value === null;
              const body = (
                <Card
                  className={cn('h-full', t.metric && 'transition-colors hover:bg-accent/40')}
                  title={t.hint}
                >
                  <CardHeader className="pb-1">
                    <CardTitle className="text-sm font-normal text-muted-foreground">
                      {t.label}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {noMeta ? (
                      <div className="text-sm text-muted-foreground">нет данных с Meta</div>
                    ) : (
                      <>
                        <div className="text-2xl font-semibold tabular-nums">
                          {t.format ? t.format(value, q.data.current) : int(value)}
                        </div>
                        {t.format && q.data.fx && (
                          <div className="text-xs text-muted-foreground">
                            {approxSom(value, q.data.current.spendCurrency, q.data.fx.rate)}
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground">
                          {delta === null
                            ? 'к прошлому периоду: —'
                            : `${delta > 0 ? '+' : ''}${delta}% к прошлому периоду`}
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              );
              return t.metric ? (
                <Link
                  key={t.label}
                  href={href('/leads', { metric: t.metric })}
                  aria-label={`${t.label}: показать лидов`}
                >
                  {body}
                </Link>
              ) : (
                <div key={t.label}>{body}</div>
              );
            })}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Состояние данных</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1 text-sm">
              {q.data.sources.map((s) => (
                <div key={s.type} className="flex flex-wrap justify-between gap-2">
                  <span>{INTEGRATION_LABELS[s.type]}</span>
                  <span className="text-muted-foreground">
                    {INTEGRATION_STATUS_LABELS[s.status]}
                    {s.lastSyncAt &&
                      ` · ${formatDistanceToNow(parseISO(s.lastSyncAt), { addSuffix: true, locale: ru })}`}
                  </span>
                </div>
              ))}
              {!q.data.sources.some((s) => s.type === 'meta_ads') && (
                <div className="flex justify-between">
                  <span>Meta Ads</span>
                  <span className="text-muted-foreground">
                    не подключено — расхода и цены за лид нет
                  </span>
                </div>
              )}
              {q.data.preliminaryFrom && (
                <p className="pt-2 text-xs text-muted-foreground">
                  Данные с {q.data.preliminaryFrom} предварительные: статусы сделок и расход ещё
                  меняются.
                </p>
              )}
              {q.data.fx && (
                <p className="text-xs text-muted-foreground">Курс для сомов: {q.data.fx.source}</p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}
