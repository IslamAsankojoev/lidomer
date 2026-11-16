'use client';

import { heatmapResponseSchema } from '@lidomer/shared';
import { ErrorState, LoadingState } from '@/components/state';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useWorkspaceQuery } from './use-workspace-query';

const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

/** «Когда пишут»: новые лиды по дню недели и часу. */
export function Heatmap({ from, to }: { from: string; to: string }) {
  const q = useWorkspaceQuery(heatmapResponseSchema, `/insights/heatmap?from=${from}&to=${to}`);
  // Шкала по корню с потолком на 95-м перцентиле: один всплеск (например, импорт) не гасит остальные часы.
  const values = q.data
    ? q.data.cells
        .flat()
        .filter((n) => n > 0)
        .sort((a, b) => a - b)
    : [];
  const cap = Math.max(1, values[Math.floor(values.length * 0.95)] ?? 1);
  const shade = (n: number) => 20 + Math.sqrt(Math.min(n, cap) / cap) * 80;
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
              className="w-full border-separate border-spacing-0.5 text-[10px]"
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
                        style={{
                          background: n
                            ? `color-mix(in oklch, var(--chart-1) ${shade(n)}%, transparent)`
                            : 'var(--muted)',
                        }}
                      />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
