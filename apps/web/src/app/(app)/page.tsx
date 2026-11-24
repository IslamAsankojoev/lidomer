'use client';

import {
  change,
  leadWord,
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
import { TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { PeriodBar } from '@/components/period-bar';
import { Asks } from '@/components/overview/asks';
import { DailyChart } from '@/components/overview/daily-chart';
import { Funnel } from '@/components/overview/funnel';
import { Heatmap } from '@/components/overview/heatmap';
import { PeriodStrip } from '@/components/overview/period-strip';
import { TopCreatives } from '@/components/overview/top-creatives';
import { ChartSkeleton } from '@/components/skeletons';
import { ErrorState, LoadingState } from '@/components/state';
import { InfoHint } from '@/components/info-hint';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useApi } from '@/lib/api';
import { approxSom, int, money } from '@/lib/format';
import { usePeriod } from '@/lib/period';
import { usePeriodHref } from '@/lib/period-link';
import { useWorkspace } from '@/lib/workspace';
import { SourceLogo } from '@/components/source-badge';

interface Tile {
  label: string;
  /** Подпись в узкой ячейке строки разбивки под главной цифрой. */
  short?: string;
  hint: string;
  metric?: LeadMetric;
  value: (c: Counts) => number | null;
  format?: (n: number, c: Counts) => string;
  /** В какую сторону изменение — хорошо: красим динамику. Без поля — нейтрально. */
  better?: 'up' | 'down';
}

const TILES: Tile[] = [
  {
    label: 'Всего лидов (сделок) за период',
    better: 'up',
    hint: 'Каждая сделка Bitrix24 в воронках, отмеченных в «Настройках», — один лид, повторные обращения тоже. Ниже — откуда они пришли.',
    metric: 'totalLeads',
    value: (c) => c.totalLeads,
  },
  {
    label: 'Лиды с рекламы · факт',
    short: 'Реклама',
    better: 'up',
    hint: 'Сделки Bitrix24 из рекламы: от лидов WARD с объявлением, с рекламными UTM или из рекламных источников.',
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
    hint: 'Комментарии под постами без рекламы (WARD).',
    metric: 'organicLeads',
    value: (c) => c.organicLeads,
  },
  {
    label: 'Direct, источник не определён',
    short: 'Direct без источника',
    hint: 'WARD отдаёт Direct без пометки рекламы — пока не относим ни к рекламе, ни к органике.',
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
    hint: 'Лиды, у которых есть телефон.',
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
    hint: 'Из всех лидов — те, где тот же Instagram или телефон уже обращался в окне из «Настроек». Входят в число лидов.',
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
  return (
    <Card size="sm" className="h-full">
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <CardTitle className="text-xs leading-snug font-normal text-muted-foreground sm:text-sm">
          {t.label}
        </CardTitle>
        <Hint t={t} />
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
        <Delta t={t} current={current} before={before} />
      </CardContent>
    </Card>
  );
}

const byMetric = (m: LeadMetric) => TILES.find((t) => t.metric === m)!;
/** Главная цифра (крупно) и строка под ней; остальное — компактной сеткой ниже. */
const HERO = byMetric('totalLeads');
/** «С телефоном» — мелкой строкой под главной цифрой, не отдельной плиткой. */
const PHONE = byMetric('withPhone');
const STRIP = [
  byMetric('adLeads'),
  byMetric('organicLeads'),
  byMetric('directUnknownLeads'),
  byMetric('otherLeads'),
];
const REST = TILES.filter((t) => t !== HERO && t !== PHONE && !STRIP.includes(t));

/** Карточка «как в WARD»: все лиды крупно с бейджем изменения, под ними — откуда они пришли. */
function Hero({ current, before }: { current: Counts; before: Counts }) {
  const href = usePeriodHref();
  const value = HERO.value(current) ?? 0;
  const prev = HERO.value(before);
  const diff = prev === null ? null : value - prev;
  return (
    <Card className="gap-0 py-0">
      <div className="flex flex-col gap-2 p-4 sm:p-5">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          {HERO.label}
          <Hint t={HERO} />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Link
            href={href('/leads', { metric: 'totalLeads' })}
            aria-label={`${HERO.label}: показать лидов`}
            className="flex items-baseline gap-2 rounded-md hover:underline"
          >
            <span className="text-5xl leading-none font-bold tracking-tight tabular-nums sm:text-6xl">
              {int(value)}
            </span>
            <span className="text-xl font-semibold">{leadWord(value)}</span>
          </Link>
          {diff !== null && diff !== 0 && (
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                diff > 0 ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive',
              )}
            >
              {diff > 0 ? (
                <TrendingUp className="size-3.5" aria-hidden />
              ) : (
                <TrendingDown className="size-3.5" aria-hidden />
              )}
              на {int(Math.abs(diff))} {diff > 0 ? 'больше' : 'меньше'}, чем в прошлый период
            </span>
          )}
        </div>
        <Link
          href={href('/leads', { metric: 'withPhone' })}
          aria-label={`${PHONE.label}: показать лидов`}
          className="w-fit rounded-md text-sm text-muted-foreground hover:underline"
        >
          {int(current.withPhone)} с телефоном
        </Link>
      </div>
      <div className="grid grid-cols-2 border-t sm:grid-cols-4">
        {STRIP.map((t, i) => (
          <StripStat key={t.label} t={t} current={current} before={before} index={i} />
        ))}
      </div>
    </Card>
  );
}

function Hint({ t }: { t: Tile }) {
  return <InfoHint label={t.label}>{t.hint}</InfoHint>;
}

function Delta({ t, current, before }: { t: Tile; current: Counts; before: Counts }) {
  const delta = change(t.value(current), t.value(before));
  if (t.value(current) === null) return null;
  const good = delta !== null && delta !== 0 && t.better && delta > 0 === (t.better === 'up');
  const bad = delta !== null && delta !== 0 && t.better && !good;
  const Trend = delta !== null && delta < 0 ? TrendingDown : TrendingUp;
  return (
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
  );
}

/** Ячейка строки под главной цифрой; разделители — рамки между ячейками. */
function StripStat({
  t,
  current,
  before,
  index,
}: {
  t: Tile;
  current: Counts;
  before: Counts;
  index: number;
}) {
  const href = usePeriodHref();
  const value = t.value(current);
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-0.5 px-4 py-3 sm:px-5',
        index % 2 === 1 && 'border-l',
        index >= 2 && 'border-t sm:border-t-0',
        index === 2 && 'sm:border-l',
      )}
    >
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <span className="leading-tight">{t.short ?? t.label}</span>
        <Hint t={t} />
      </div>
      {value === null || !t.metric ? (
        <div className="text-sm text-muted-foreground">нет данных</div>
      ) : (
        <Link
          href={href('/leads', { metric: t.metric })}
          aria-label={`${t.label}: показать лидов`}
          className="w-fit text-xl font-semibold tabular-nums hover:underline"
        >
          {int(value)}
        </Link>
      )}
      <Delta t={t} current={current} before={before} />
    </div>
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
        description={`Дни считаются по поясу ${workspace.timezone}`}
        actions={<PeriodBar />}
      />
      <PeriodStrip />
      {q.isPending ? (
        <OverviewSkeleton />
      ) : q.isError ? (
        <ErrorState message={q.error.message} onRetry={() => void q.refetch()} />
      ) : (
        <>
          <Hero current={q.data.current} before={q.data.before} />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {REST.map((t) => (
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

/** Каркас «Обзора»: главная цифра с полосой из четырёх, плитки и график — как после загрузки. */
function OverviewSkeleton() {
  return (
    <LoadingState className="flex flex-col gap-5 md:gap-6">
      <Card className="gap-0 py-0">
        <div className="flex flex-col gap-2.5 p-4 sm:p-5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-12 w-52 sm:h-15 sm:w-64" />
          <Skeleton className="h-4 w-60 max-w-full" />
        </div>
        <div className="grid grid-cols-2 border-t sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={cn(
                'flex flex-col gap-1.5 px-4 py-3 sm:px-5',
                i % 2 === 1 && 'border-l',
                i >= 2 && 'border-t sm:border-t-0',
                i === 2 && 'sm:border-l',
              )}
            >
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-5 w-12" />
            </div>
          ))}
        </div>
      </Card>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} size="sm">
            <CardHeader>
              <Skeleton className="h-3.5 w-24" />
            </CardHeader>
            <CardContent className="flex flex-col gap-1.5">
              <Skeleton className="h-7 w-16" />
              <Skeleton className="h-3 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader className="gap-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </CardHeader>
        <CardContent>
          <ChartSkeleton className="h-60 sm:h-72" />
        </CardContent>
      </Card>
    </LoadingState>
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
        {data.journal.stale && (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-destructive">
            {data.journal.updatedAt
              ? `Лиды и метрики последний раз пересчитаны ${formatDistanceToNow(parseISO(data.journal.updatedAt), { addSuffix: true, locale: ru })}: новые сделки сюда ещё не попали.`
              : 'Лиды и метрики ещё не пересчитаны — цифры на экране неполные.'}
          </p>
        )}
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
                <div className="flex items-center gap-1.5 font-medium">
                  <SourceLogo source={s.type} />
                  {INTEGRATION_LABELS[s.type]}
                </div>
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
                <div className="flex items-center gap-1.5 font-medium">
                  <SourceLogo source="meta_ads" />
                  {INTEGRATION_LABELS.meta_ads}
                </div>
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
