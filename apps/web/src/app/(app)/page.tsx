'use client';

import {
  change,
  type Counts,
  INTEGRATION_LABELS,
  INTEGRATION_STATUS_LABELS,
  type LeadMetric,
  type SummaryResponse,
  summaryResponseSchema,
} from '@lidomer/shared';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Info, TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { Asks } from '@/components/overview/asks';
import { DailyChart } from '@/components/overview/daily-chart';
import { Funnel } from '@/components/overview/funnel';
import { Heatmap } from '@/components/overview/heatmap';
import { PeriodStrip } from '@/components/overview/period-strip';
import { TopCreatives } from '@/components/overview/top-creatives';
import { ErrorState, LoadingState } from '@/components/state';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useApi } from '@/lib/api';
import { approxSom, int, money } from '@/lib/format';
import { usePeriod } from '@/lib/period';
import { usePeriodHref } from '@/lib/period-link';
import { useWorkspace } from '@/lib/workspace';

interface Tile {
  label: string;
  hint: string;
  metric?: LeadMetric;
  value: (c: Counts) => number | null;
  format?: (n: number, c: Counts) => string;
  /** В какую сторону изменение — хорошо: красим динамику. Без поля — нейтрально. */
  better?: 'up' | 'down';
}

const TILES: Tile[] = [
  {
    label: 'Лиды с рекламы · факт',
    better: 'up',
    hint: 'Лиды Ward с объявлением + сделки Bitrix24 с рекламными UTM или из рекламных источников. Повторы не входят.',
    metric: 'adLeads',
    value: (c) => c.adLeads,
  },
  {
    label: 'Цена за лид · факт',
    better: 'down',
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
    better: 'up',
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
    better: 'up',
    hint: 'Новые лиды, у которых есть телефон.',
    metric: 'withPhone',
    value: (c) => c.withPhone,
  },
  {
    label: 'Продажи',
    better: 'up',
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

function MetricTile({
  t,
  current,
  before,
  fxRate,
}: {
  t: Tile;
  current: Counts;
  before: Counts;
  fxRate: number | null;
}) {
  const href = usePeriodHref();
  const value = t.value(current);
  const delta = change(value, t.value(before));
  const shown =
    value === null ? null : (
      <>
        <div className="text-xl font-semibold tabular-nums sm:text-2xl">
          {t.format ? t.format(value, current) : int(value)}
        </div>
        {t.format && (
          <div className="text-xs text-muted-foreground">
            {approxSom(value, current.spendCurrency, fxRate)}
          </div>
        )}
      </>
    );
  const good = delta !== null && delta !== 0 && t.better && delta > 0 === (t.better === 'up');
  const bad = delta !== null && delta !== 0 && t.better && !good;
  const Trend = delta !== null && delta < 0 ? TrendingDown : TrendingUp;
  return (
    <Card size="sm" className="h-full">
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <CardTitle className="text-xs leading-snug font-normal text-muted-foreground sm:text-sm">
          {t.label}
        </CardTitle>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label={`Как считается: ${t.label}`}
                className="-m-1 shrink-0 p-1 text-muted-foreground hover:text-foreground"
              >
                <Info className="size-3.5" />
              </button>
            }
          />
          <TooltipContent className="max-w-72">{t.hint}</TooltipContent>
        </Tooltip>
      </CardHeader>
      <CardContent className="mt-auto flex flex-col gap-0.5">
        {value === null ? (
          <div className="text-sm text-muted-foreground">нет данных с Meta</div>
        ) : t.metric ? (
          <Link
            href={href('/leads', { metric: t.metric })}
            className="block w-fit rounded-md hover:underline"
            aria-label={`${t.label}: показать лидов`}
          >
            {shown}
          </Link>
        ) : (
          shown
        )}
        {value !== null && (
          <div
            className={cn(
              'flex items-center gap-1 text-xs text-muted-foreground',
              good && 'text-success',
              bad && 'text-destructive',
            )}
            title="К прошлому периоду той же длины"
          >
            {delta === null ? (
              'к прошлому: —'
            ) : (
              <>
                {delta !== 0 && <Trend className="size-3.5" aria-hidden />}
                {`${delta > 0 ? '+' : ''}${Math.abs(delta) >= 10 ? Math.round(delta) : delta}% к прошлому`}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function OverviewPage() {
  const api = useApi();
  const { workspace } = useWorkspace();
  const { range } = usePeriod();
  const q = useQuery({
    queryKey: ['summary', workspace.id, range],
    queryFn: () =>
      api(summaryResponseSchema, `/metrics/summary?from=${range.from}&to=${range.to}`, {
        workspaceId: workspace.id,
      }),
  });

  return (
    <>
      <PageHeader title="Обзор" description={`Дни считаются по поясу ${workspace.timezone}`} />
      <PeriodStrip />
      {q.isPending ? (
        <LoadingState rows={3} />
      ) : q.isError ? (
        <ErrorState message={q.error.message} onRetry={() => void q.refetch()} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 [&>:last-child:nth-child(odd)]:col-span-2 lg:[&>:last-child:nth-child(odd)]:col-span-1">
            {TILES.map((t) => (
              <MetricTile
                key={t.label}
                t={t}
                current={q.data.current}
                before={q.data.before}
                fxRate={q.data.fx?.rate ?? null}
              />
            ))}
          </div>
          <DailyChart from={range.from} to={range.to} currency={q.data.current.spendCurrency} />
          <div className="grid gap-4 lg:grid-cols-2">
            <Funnel from={range.from} to={range.to} />
            <TopCreatives from={range.from} to={range.to} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Heatmap from={range.from} to={range.to} />
            <Asks from={range.from} to={range.to} />
          </div>
          <DataState data={q.data} />
        </>
      )}
    </>
  );
}

function DataState({ data }: { data: SummaryResponse }) {
  const metaShown = data.sources.some((s) => s.type === 'meta_ads' && s.status !== 'disabled');
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Состояние данных</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <ul className="grid gap-2 sm:grid-cols-3">
          {data.sources.map((s) => (
            <li key={s.type} className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2">
              <span
                className={cn(
                  'mt-1.5 size-2 shrink-0 rounded-full',
                  s.status === 'connected' || s.status === 'syncing'
                    ? 'bg-success'
                    : s.status === 'error' || s.status === 'reauth_required'
                      ? 'bg-destructive'
                      : 'bg-muted-foreground/50',
                )}
                aria-hidden
              />
              <div className="min-w-0">
                <div className="font-medium">{INTEGRATION_LABELS[s.type]}</div>
                <div className="text-xs text-muted-foreground">
                  {INTEGRATION_STATUS_LABELS[s.status]}
                  {s.lastSyncAt &&
                    ` · ${formatDistanceToNow(parseISO(s.lastSyncAt), { addSuffix: true, locale: ru })}`}
                </div>
              </div>
            </li>
          ))}
          {!metaShown && (
            <li className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2">
              <span
                className="mt-1.5 size-2 shrink-0 rounded-full bg-muted-foreground/50"
                aria-hidden
              />
              <div className="min-w-0">
                <div className="font-medium">Meta Ads</div>
                <div className="text-xs text-muted-foreground">
                  не подключено — расхода и цены за лид нет
                </div>
              </div>
            </li>
          )}
        </ul>
        {(data.preliminaryFrom || data.fx) && (
          <p className="text-xs text-muted-foreground">
            {data.preliminaryFrom &&
              `Данные с ${data.preliminaryFrom} предварительные: статусы сделок и расход ещё меняются. `}
            {data.fx && `Курс для сомов: ${data.fx.source}.`}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
