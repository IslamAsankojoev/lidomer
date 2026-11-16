'use client';

import { costPerLead, dailyResponseSchema } from '@lidomer/shared';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { ErrorState, LoadingState } from '@/components/state';
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
        <CardTitle className="text-base">Лиды по дням</CardTitle>
        <CardDescription>Новые лиды по каналам; повторные обращения не входят</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {q.isPending ? (
          <LoadingState rows={2} />
        ) : q.isError ? (
          <ErrorState message={q.error.message} onRetry={() => void q.refetch()} />
        ) : (
          <>
            <ChartContainer config={config} className="aspect-auto h-64 w-full">
              <BarChart data={points} margin={{ left: -16, right: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="day"
                  tickFormatter={dayLabel}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={16}
                />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} />
                <ChartTooltip
                  content={<ChartTooltipContent labelFormatter={(v) => dayLabel(String(v))} />}
                />
                <ChartLegend content={<ChartLegendContent />} />
                {(Object.keys(config) as (keyof typeof config)[]).map((k, i, arr) => (
                  <Bar
                    key={k}
                    dataKey={k}
                    stackId="leads"
                    fill={`var(--color-${k})`}
                    radius={i === arr.length - 1 ? [4, 4, 0, 0] : 0}
                  />
                ))}
              </BarChart>
            </ChartContainer>
            <div>
              <div className="mb-1 text-sm text-muted-foreground">Цена за лид · факт</div>
              {hasSpend ? (
                <ChartContainer config={cplConfig} className="aspect-auto h-28 w-full">
                  <LineChart data={cpl} margin={{ left: -16, right: 8 }}>
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
                      width={40}
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
                    <Line
                      dataKey="cpl"
                      stroke="var(--color-cpl)"
                      strokeWidth={2}
                      dot={false}
                      connectNulls={false}
                    />
                  </LineChart>
                </ChartContainer>
              ) : (
                <div className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
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
