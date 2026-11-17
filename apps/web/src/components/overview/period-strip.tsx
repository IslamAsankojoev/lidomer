'use client';

import { resolvePreset, summaryResponseSchema } from '@lidomer/shared';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { int } from '@/lib/format';
import { usePeriod } from '@/lib/period';
import { cn } from '@/lib/utils';
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
  const active = usePeriod().preset === preset;
  return (
    <Link
      href={`/?period=${preset}`}
      className="min-w-0 rounded-xl"
      aria-current={active ? 'true' : undefined}
    >
      <Card
        size="sm"
        className={cn(
          'h-full transition-colors hover:bg-accent/40',
          active && 'border-primary/50 bg-primary/5',
        )}
      >
        <CardContent className="flex flex-col gap-0.5">
          <div className="truncate text-xs text-muted-foreground">
            {label}
            {hint && <span className="hidden sm:inline"> · {hint}</span>}
          </div>
          {q.data ? (
            <>
              <div className="text-base font-semibold tabular-nums sm:text-lg">
                {int(q.data.current.totalLeads)}
                <span className="hidden sm:inline"> лидов</span>
              </div>
              <div className="text-[11px] leading-tight text-muted-foreground sm:text-xs">
                реклама {int(q.data.current.adLeads)} · продаж {int(q.data.current.sales)}
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
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      {PRESETS.map((p) => (
        <StripCell key={p.preset} {...p} />
      ))}
    </div>
  );
}
