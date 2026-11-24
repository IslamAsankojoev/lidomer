'use client';

import { costPerLead, dailyResponseSchema } from '@lidomer/shared';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { ChartSkeleton } from '@/components/skeletons';
import { ErrorState, LoadingState } from '@/components/state';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { money } from '@/lib/format';
import { useWorkspaceQuery } from './use-workspace-query';

const config = {
  adLeads: { label: 'Реклама', color: 'var(--chart-1)' },
  organicLeads: { label: 'Органика', color: 'var(--chart-2)' },
  directUnknownLeads: { label: 'Direct без источника', color: 'var(--chart-3)' },
  otherLeads: { label: 'Другие каналы', color: 'var(--chart-4)' },
} satisfies ChartConfig;

const cplConfig = { cpl: { label: 'Цена за лид', color: 'var(--chart-1)' } } satisfies ChartConfig;

const dayLabel = (d: string) => format(parseISO(d), 'd MMM', { locale: ru });

/** Лиды по дням (реклама, органика, Direct, другие) и под ними — цена за лид. */
export function DailyChart({
  from,
  to,
  currency,
}: {
  from: string;
  to: string;
  currency: string | null;
}) {
  const q = useWorkspaceQuery(dailyResponseSchema, `/metrics/daily?from=${from}&to=${to}`);
  const points = q.data?.points ?? [];
  const hasSpend = points.some((p) => p.spendMinor !== null);
  const cpl = points.map((p) => ({ day: p.day, cpl: costPerLead(p.spendMinor, p.adLeads) }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Лиды по дням</CardTitle>
        <CardDescription>Лиды (сделки) по каналам, включая повторные обращения</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {q.isPending ? (
          <LoadingState className="flex flex-col gap-4">
            <ChartSkeleton className="h-60 sm:h-72" />
            <div className="flex justify-center gap-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-3 w-16" />
              ))}
            </div>
          </LoadingState>
        ) : q.isError ? (
          <ErrorState message={q.error.message} onRetry={() => void q.refetch()} />
        ) : (
          <>
            <ChartContainer config={config} className="aspect-auto h-60 w-full sm:h-72">
              <AreaChart data={points} margin={{ left: 0, right: 8, top: 8 }}>
                <defs>
                  {(Object.keys(config) as (keyof typeof config)[]).map((k) => (
                    <linearGradient key={k} id={`fill-${k}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={`var(--color-${k})`} stopOpacity={0.75} />
                      <stop offset="95%" stopColor={`var(--color-${k})`} stopOpacity={0.08} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="day"
                  tickFormatter={dayLabel}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={16}
                />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width="auto" />
                <ChartTooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  content={
                    <ChartTooltipContent
                      indicator="dot"
                      labelFormatter={(v) => dayLabel(String(v))}
                    />
                  }
                />
                <ChartLegend content={<ChartLegendContent />} />
                {/* Снизу — реклама, сверху — остальные каналы; кривые плавные (monotone не выходит за данные). */}
                {(Object.keys(config) as (keyof typeof config)[]).map((k) => (
                  <Area
                    key={k}
                    dataKey={k}
                    type="monotone"
                    stackId="leads"
                    stroke={`var(--color-${k})`}
                    strokeWidth={2}
                    fill={`url(#fill-${k})`}
                    activeDot={{ r: 4 }}
                  />
                ))}
              </AreaChart>
            </ChartContainer>
            <div>
              <div className="mb-1 text-sm text-muted-foreground">Цена за лид · факт</div>
              {hasSpend ? (
                <ChartContainer config={cplConfig} className="aspect-auto h-28 w-full">
                  <AreaChart data={cpl} margin={{ left: 0, right: 8, top: 4 }}>
                    <defs>
                      <linearGradient id="fill-cpl" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-cpl)" stopOpacity={0.5} />
                        <stop offset="95%" stopColor="var(--color-cpl)" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="day"
                      tickFormatter={dayLabel}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={16}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      width="auto"
                      tickFormatter={(v: number) => money(v, currency) ?? ''}
                    />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          labelFormatter={(v) => dayLabel(String(v))}
                          formatter={(v) => money(Number(v), currency) ?? '—'}
                        />
                      }
                    />
                    <Area
                      dataKey="cpl"
                      type="monotone"
                      stroke="var(--color-cpl)"
                      strokeWidth={2}
                      fill="url(#fill-cpl)"
                      connectNulls={false}
                    />
                  </AreaChart>
                </ChartContainer>
              ) : (
                <div className="rounded-lg border border-dashed px-3 py-2.5 text-xs text-muted-foreground sm:text-sm">
                  нет данных с Meta — подключите Meta Ads, чтобы видеть расход и цену за лид
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
