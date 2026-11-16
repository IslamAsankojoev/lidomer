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
import { Info } from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { formatPeriod } from '@/components/period-bar';
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
        <div className="text-2xl font-semibold tabular-nums">
          {t.format ? t.format(value, current) : int(value)}
        </div>
        {t.format && (
          <div className="text-xs text-muted-foreground">
            {approxSom(value, current.spendCurrency, fxRate)}
          </div>
        )}
      </>
    );
  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-1">
        <CardTitle className="text-sm font-normal text-muted-foreground">{t.label}</CardTitle>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label={`Как считается: ${t.label}`}
                className="text-muted-foreground hover:text-foreground"
              >
                <Info className="size-4" />
              </button>
            }
          />
          <TooltipContent className="max-w-72">{t.hint}</TooltipContent>
        </Tooltip>
      </CardHeader>
      <CardContent>
        {value === null ? (
          <div className="text-sm text-muted-foreground">нет данных с Meta</div>
        ) : t.metric ? (
          <Link
            href={href('/leads', { metric: t.metric })}
            className="block rounded-md hover:underline"
            aria-label={`${t.label}: показать лидов`}
          >
            {shown}
          </Link>
        ) : (
          shown
        )}
        {value !== null && (
          <div className="text-xs text-muted-foreground">
            {delta === null
              ? 'к прошлому периоду: —'
              : `${delta > 0 ? '+' : ''}${delta}% к прошлому периоду`}
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
      <PageHeader
        title="Обзор"
        description={`${workspace.name} · ${formatPeriod(range)} · дни по ${workspace.timezone}`}
      />
      <PeriodStrip />
      {q.isPending ? (
        <LoadingState rows={3} />
      ) : q.isError ? (
        <ErrorState message={q.error.message} onRetry={() => void q.refetch()} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Состояние данных</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1 text-sm">
        {data.sources.map((s) => (
          <div key={s.type} className="flex flex-wrap justify-between gap-2">
            <span>{INTEGRATION_LABELS[s.type]}</span>
            <span className="text-muted-foreground">
              {INTEGRATION_STATUS_LABELS[s.status]}
              {s.lastSyncAt &&
                ` · ${formatDistanceToNow(parseISO(s.lastSyncAt), { addSuffix: true, locale: ru })}`}
            </span>
          </div>
        ))}
        {!data.sources.some((s) => s.type === 'meta_ads' && s.status !== 'disabled') && (
          <div className="flex flex-wrap justify-between gap-2">
            <span>Meta Ads</span>
            <span className="text-muted-foreground">не подключено — расхода и цены за лид нет</span>
          </div>
        )}
        {data.preliminaryFrom && (
          <p className="pt-2 text-xs text-muted-foreground">
            Данные с {data.preliminaryFrom} предварительные: статусы сделок и расход ещё меняются.
          </p>
        )}
        {data.fx && (
          <p className="text-xs text-muted-foreground">Курс для сомов: {data.fx.source}</p>
        )}
      </CardContent>
    </Card>
  );
}
