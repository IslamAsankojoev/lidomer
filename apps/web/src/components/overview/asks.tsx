'use client';

import { asksResponseSchema } from '@lidomer/shared';
import { ErrorState, LoadingState } from '@/components/state';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useWorkspaceQuery } from './use-workspace-query';

function Bars({ title, items }: { title: string; items: { label: string; count: number }[] }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-sm font-medium">{title}</div>
      {items.length ? (
        items.map((i) => (
          <div key={i.label} className="flex items-center gap-2 text-sm">
            <span className="w-32 shrink-0 truncate" title={i.label}>
              {i.label}
            </span>
            <div className="h-2 flex-1 rounded-full bg-muted">
              <div
                className="h-2 rounded-full bg-[var(--chart-2)]"
                style={{ width: `${(i.count / max) * 100}%` }}
              />
            </div>
            <span className="w-8 text-right tabular-nums">{i.count}</span>
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
            ? `Анкета Ward есть у ${q.data.withFacts} из ${q.data.wardLeads} лидов Ward`
            : 'Анкета бота Ward'}
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
