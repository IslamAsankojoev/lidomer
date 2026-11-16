'use client';

import { funnelResponseSchema, percent } from '@lidomer/shared';
import { ErrorState, LoadingState } from '@/components/state';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { int } from '@/lib/format';
import { useWorkspaceQuery } from './use-workspace-query';

/**
 * Воронка Ward → Bitrix24. Каждый шаг — часть предыдущего: переписка → лид → сделка → продажа.
 * Телефон и «в работе» — отдельной строкой: сделка бывает и без телефона.
 */
export function Funnel({ from, to }: { from: string; to: string }) {
  const q = useWorkspaceQuery(funnelResponseSchema, `/metrics/funnel?from=${from}&to=${to}`);
  const d = q.data;
  const steps = d
    ? [
        { label: 'Переписки в Ward', value: d.conversations },
        { label: 'Лиды Ward', value: d.wardLeads },
        { label: 'Сделка в Bitrix24', value: d.withDeal },
        { label: 'Продажа', value: d.sales },
      ]
    : [];
  const max = Math.max(1, ...steps.map((s) => s.value));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Воронка Ward → Bitrix24</CardTitle>
        <CardDescription>Обращения из Instagram за период и что с ними стало</CardDescription>
      </CardHeader>
      <CardContent>
        {q.isPending ? (
          <LoadingState rows={2} />
        ) : q.isError || !d ? (
          <ErrorState message={q.error?.message} onRetry={() => void q.refetch()} />
        ) : (
          <div className="flex flex-col gap-3">
            <ol className="flex flex-col gap-2">
              {steps.map((s, i) => {
                const conv = i ? percent(s.value, steps[i - 1]!.value) : null;
                return (
                  <li key={s.label} className="flex flex-col gap-1">
                    <div className="flex justify-between text-sm">
                      <span>{s.label}</span>
                      <span className="tabular-nums">
                        {int(s.value)}
                        {conv !== null && (
                          <span className="ml-2 text-xs text-muted-foreground">{conv}%</span>
                        )}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-[var(--chart-1)]"
                        style={{ width: `${(s.value / max) * 100}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ol>
            <p className="text-xs text-muted-foreground">
              С телефоном {int(d.withPhone)} ({percent(d.withPhone, d.wardLeads) ?? '—'}% лидов) · в
              работе {int(d.inWork)} · без сделки {int(d.wardLeads - d.withDeal)}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
