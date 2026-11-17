'use client';

import { heatmapResponseSchema } from '@lidomer/shared';
import { ErrorState, LoadingState } from '@/components/state';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Когда пишут</CardTitle>
        <CardDescription>Новые лиды по дню недели и часу, время по поясу компании</CardDescription>
      </CardHeader>
      <CardContent>
        {q.isPending ? (
          <LoadingState rows={2} />
        ) : q.isError ? (
          <ErrorState message={q.error.message} onRetry={() => void q.refetch()} />
        ) : (
          <div className="overflow-x-auto">
            <table
              className="w-full border-separate border-spacing-[3px] text-[10px]"
              aria-label="Лиды по дню и часу"
            >
              <thead>
                <tr>
                  <th />
                  {Array.from({ length: 24 }, (_, h) => (
                    <th key={h} className="font-normal text-muted-foreground">
                      {h % 3 === 0 ? h : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {q.data.cells.map((row, d) => (
                  <tr key={DAYS[d]}>
                    <th className="pr-1 text-left font-normal text-muted-foreground">{DAYS[d]}</th>
                    {row.map((n, h) => (
                      <td
                        key={h}
                        title={`${DAYS[d]}, ${h}:00–${h + 1}:00 — ${n} лидов`}
                        className="h-5 min-w-3 rounded-sm"
                        style={{ background: HEAT[level(n)] }}
                      />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <div
              className="mt-3 flex items-center justify-end gap-1 text-[10px] text-muted-foreground"
              aria-hidden
            >
              меньше
              {HEAT.map((c) => (
                <span key={c} className="size-3 rounded-sm" style={{ background: c }} />
              ))}
              больше
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
