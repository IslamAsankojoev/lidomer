'use client';

import { creativesResponseSchema } from '@lidomer/shared';
import Link from 'next/link';
import { ListSkeleton } from '@/components/skeletons';
import { ErrorState, LoadingState } from '@/components/state';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { adTitle } from '@/lib/ads';
import { int, money } from '@/lib/format';
import { usePeriodHref } from '@/lib/period-link';
import { useWorkspaceQuery } from './use-workspace-query';

/** Пять креативов с наибольшим числом лидов. */
export function TopCreatives({ from, to }: { from: string; to: string }) {
  const q = useWorkspaceQuery(creativesResponseSchema, `/creatives?from=${from}&to=${to}`);
  const href = usePeriodHref();
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="text-base">Лучшие креативы</CardTitle>
          <CardDescription>По числу лидов с рекламы</CardDescription>
        </div>
        <Link
          href={href('/creatives')}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Все →
        </Link>
      </CardHeader>
      <CardContent>
        {q.isPending ? (
          <LoadingState>
            <ListSkeleton rows={5} />
          </LoadingState>
        ) : q.isError ? (
          <ErrorState message={q.error.message} onRetry={() => void q.refetch()} />
        ) : !q.data.items.length ? (
          <p className="text-sm text-muted-foreground">Лидов с рекламы за период нет.</p>
        ) : (
          <ol className="flex flex-col divide-y">
            {q.data.items.slice(0, 5).map((c, i) => (
              <li key={c.adKey} className="flex items-center justify-between gap-3 py-2">
                <Link
                  href={href('/leads', { metric: 'adLeads', adKey: c.adKey })}
                  className="flex min-w-0 items-center gap-2.5 hover:underline"
                >
                  {c.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- подписанная ссылка Storage
                    <img
                      src={c.previewUrl}
                      alt=""
                      aria-hidden
                      loading="lazy"
                      className="size-9 shrink-0 rounded-md object-cover"
                    />
                  ) : (
                    <span className="size-9 shrink-0 rounded-md bg-muted" aria-hidden />
                  )}
                  <span className="min-w-0">
                    <div className="truncate text-sm">
                      {i + 1}. {adTitle(c)}
                    </div>
                    {c.campaignName && (
                      <div className="truncate text-xs text-muted-foreground">
                        {c.campaignName} › {c.adsetName}
                      </div>
                    )}
                  </span>
                </Link>
                <div className="shrink-0 text-right text-sm tabular-nums">
                  {int(c.leads)} лидов
                  <div className="text-xs text-muted-foreground">
                    {c.cplFactMinor !== null
                      ? `${money(c.cplFactMinor, q.data.spendCurrency)} за лид`
                      : `продаж ${c.sales}`}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
