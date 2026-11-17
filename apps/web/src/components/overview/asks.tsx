'use client';

import { asksResponseSchema } from '@lidomer/shared';
import { ErrorState, LoadingState } from '@/components/state';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useWorkspaceQuery } from './use-workspace-query';

function Bars({ title, items }: { title: string; items: { label: string; count: number }[] }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs font-medium text-muted-foreground uppercase">{title}</div>
      {items.length ? (
        // Как в воронке: подпись и число строкой, полоса под ними на всю ширину колонки.
        items.map((i) => (
          <div key={i.label} className="flex flex-col gap-1 text-sm">
            <div className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate" title={i.label}>
                {i.label}
              </span>
              <span className="tabular-nums">{i.count}</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted">
              <div
                className="h-1.5 rounded-full bg-[var(--chart-2)]"
                style={{ width: `${(i.count / max) * 100}%` }}
              />
            </div>
          </div>
        ))
      ) : (
        <p className="text-sm text-muted-foreground">нет данных</p>
      )}
    </div>
  );
}

/** «Что спрашивают»: комнаты и ЖК из анкеты Ward (бюджет — после запуска, решение 0006). */
export function Asks({ from, to }: { from: string; to: string }) {
  const q = useWorkspaceQuery(asksResponseSchema, `/insights/asks?from=${from}&to=${to}`);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Что спрашивают</CardTitle>
        <CardDescription>
          {q.data
            ? `Анкета WARD есть у ${q.data.withFacts} из ${q.data.wardLeads} лидов WARD`
            : 'Анкета бота WARD'}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 sm:grid-cols-2">
        {q.isPending ? (
          <LoadingState rows={2} />
        ) : q.isError ? (
          <ErrorState message={q.error.message} onRetry={() => void q.refetch()} />
        ) : (
          <>
            <Bars title="Комнаты" items={q.data.rooms} />
            <Bars title="Жилые комплексы" items={q.data.complexes} />
          </>
        )}
      </CardContent>
    </Card>
  );
}
