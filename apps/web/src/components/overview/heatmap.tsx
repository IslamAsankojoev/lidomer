'use client';

import { Fragment } from 'react';

import { heatmapResponseSchema } from '@lidomer/shared';
import { ErrorState, LoadingState } from '@/components/state';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useWorkspaceQuery } from './use-workspace-query';

const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const HEAT = [
  'var(--muted)',
  'var(--heat-1)',
  'var(--heat-2)',
  'var(--heat-3)',
  'var(--heat-4)',
  'var(--heat-5)',
];

/** «Когда пишут»: новые лиды по дню недели и часу. */
export function Heatmap({ from, to }: { from: string; to: string }) {
  const q = useWorkspaceQuery(heatmapResponseSchema, `/insights/heatmap?from=${from}&to=${to}`);
  // Пять ступеней по квантилям ненулевых часов: всплеск (например, импорт) не гасит остальные,
  // а соседние ступени заметно отличаются по светлоте.
  const values = q.data
    ? q.data.cells
        .flat()
        .filter((n) => n > 0)
        .sort((a, b) => a - b)
    : [];
  const thresholds = [0.2, 0.4, 0.6, 0.8].map((p) => values[Math.floor(values.length * p)] ?? 0);
  const level = (n: number) => (n ? 1 + thresholds.filter((t) => n > t).length : 0);
  // Самый частый час — подпись под картой, чтобы не искать глазами.
  let peak: string | null = null;
  let best = 0;
  q.data?.cells.forEach((row, d) =>
    row.forEach((n, h) => {
      if (n > best) {
        best = n;
        peak = `${DAYS[d]}, ${h}:00–${h + 1}:00`;
      }
    }),
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Когда пишут</CardTitle>
        <CardDescription>Новые лиды по дню недели и часу, по поясу компании</CardDescription>
      </CardHeader>
      <CardContent>
        {q.isPending ? (
          <LoadingState className="flex flex-col gap-3">
            {/* Та же сетка 7 × 24, что у карты: высота не меняется, когда придут данные. */}
            <div
              className="grid grid-cols-[auto_repeat(24,minmax(0,1fr))] gap-0.5 sm:gap-[3px]"
              aria-hidden
            >
              <span className="h-4" />
              {Array.from({ length: 24 }, (_, h) => (
                <span key={h} />
              ))}
              {DAYS.map((d) => (
                <Fragment key={d}>
                  <span className="pr-1.5 text-[10px] leading-none text-muted-foreground">{d}</span>
                  {Array.from({ length: 24 }, (_, h) => (
                    <Skeleton key={h} className="aspect-square rounded-[3px]" />
                  ))}
                </Fragment>
              ))}
            </div>
            <Skeleton className="h-3 w-48" />
          </LoadingState>
        ) : q.isError ? (
          <ErrorState message={q.error.message} onRetry={() => void q.refetch()} />
        ) : (
          <div className="flex flex-col gap-3">
            {/* Сетка вместо таблицы: 24 колонки делят ширину поровну, клетки квадратные
                и на телефоне вся неделя видна без прокрутки. */}
            <div
              className="grid grid-cols-[auto_repeat(24,minmax(0,1fr))] gap-0.5 text-[10px] text-muted-foreground sm:gap-[3px]"
              role="img"
              aria-label={
                peak ? `Лиды по дню и часу. Чаще всего пишут: ${peak}` : 'Лиды по дню и часу'
              }
            >
              <span />
              {Array.from({ length: 24 }, (_, h) => (
                <span key={h} className="text-center leading-4">
                  <span className={h % 6 ? 'hidden sm:inline' : undefined}>
                    {h % 3 === 0 ? h : ''}
                  </span>
                </span>
              ))}
              {q.data.cells.map((row, d) => (
                <Fragment key={DAYS[d]}>
                  <span className="flex items-center pr-1.5">{DAYS[d]}</span>
                  {row.map((n, h) => (
                    <span
                      key={h}
                      title={`${DAYS[d]}, ${h}:00–${h + 1}:00 — ${n} лидов`}
                      className="aspect-square rounded-[3px]"
                      style={{ background: HEAT[level(n)] }}
                    />
                  ))}
                </Fragment>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <span>
                {peak && (
                  <>
                    Чаще всего: <span className="text-foreground">{peak}</span>
                  </>
                )}
              </span>
              <span className="flex items-center gap-1" aria-hidden>
                меньше
                {HEAT.map((c) => (
                  <span key={c} className="size-2.5 rounded-[3px]" style={{ background: c }} />
                ))}
                больше
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
