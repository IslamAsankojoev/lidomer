'use client';

import { resolvePreset, summaryResponseSchema } from '@lidomer/shared';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { int } from '@/lib/format';
import { useWorkspace } from '@/lib/workspace';
import { useWorkspaceQuery } from './use-workspace-query';

const PRESETS = [
  { preset: 'today', label: 'Сегодня' },
  { preset: 'week', label: 'Неделя', hint: 'с понедельника' },
  { preset: 'month', label: 'Месяц', hint: 'с 1-го числа' },
] as const;

function StripCell({ preset, label, hint }: (typeof PRESETS)[number] & { hint?: string }) {
  const { workspace } = useWorkspace();
  const r = resolvePreset(preset, workspace.timezone);
  const q = useWorkspaceQuery(summaryResponseSchema, `/metrics/summary?from=${r.from}&to=${r.to}`);
  return (
    <Link href={`/?period=${preset}`} className="min-w-0 flex-1">
      <Card className="h-full transition-colors hover:bg-accent/40">
        <CardContent className="flex flex-col gap-0.5 py-3">
          <div className="text-xs text-muted-foreground">
            {label}
            {hint && ` · ${hint}`}
          </div>
          {q.data ? (
            <>
              <div className="text-lg font-semibold tabular-nums">
                {int(q.data.current.totalLeads)} лидов
              </div>
              <div className="text-xs text-muted-foreground">
                с рекламы {int(q.data.current.adLeads)} · продаж {int(q.data.current.sales)}
              </div>
            </>
          ) : (
            <Skeleton className="h-10 w-full" />
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

/** Полоса «Сегодня · Неделя · Месяц»: клик ставит этот период. */
export function PeriodStrip() {
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      {PRESETS.map((p) => (
        <StripCell key={p.preset} {...p} />
      ))}
    </div>
  );
}
