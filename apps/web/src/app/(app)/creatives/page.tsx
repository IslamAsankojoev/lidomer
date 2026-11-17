'use client';

import {
  costPerLead,
  type CreativeItem,
  creativesResponseSchema,
  leadsResponseSchema,
} from '@lidomer/shared';
import { useQuery } from '@tanstack/react-query';
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowUpDown, Image as ImageIcon, LayoutGrid, Table as TableIcon } from 'lucide-react';
import Link from 'next/link';
import { parseAsStringLiteral, useQueryStates } from 'nuqs';
import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { PeriodBar } from '@/components/period-bar';
import { EmptyState, ErrorState, LoadingState } from '@/components/state';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { adTitle } from '@/lib/ads';
import { useApi } from '@/lib/api';
import { int, money } from '@/lib/format';
import { usePeriod } from '@/lib/period';
import { usePeriodHref } from '@/lib/period-link';
import { useWorkspace } from '@/lib/workspace';

interface Row extends CreativeItem {
  /** Для группировки по кампаниям — сколько объявлений внутри. */
  ads?: number;
}

/** Строки по кампаниям: суммы объявлений одной кампании. */
function byCampaign(items: CreativeItem[]): Row[] {
  const m = new Map<string, Row>();
  for (const c of items) {
    const key =
      c.campaignName ?? (/^\d{10,}$/.test(c.adKey) ? 'Ward: кампания неизвестна' : 'Без кампании');
    const r = m.get(key) ?? {
      adKey: `campaign:${key}`,
      adName: key,
      campaignName: null,
      adsetName: null,
      leads: 0,
      withPhone: 0,
      sales: 0,
      spendMinor: c.spendMinor === null ? null : 0,
      metaLeads: c.metaLeads === null ? null : 0,
      cplFactMinor: null,
      ads: 0,
    };
    r.leads += c.leads;
    r.withPhone += c.withPhone;
    r.sales += c.sales;
    if (r.spendMinor !== null && c.spendMinor !== null) r.spendMinor += c.spendMinor;
    if (r.metaLeads !== null && c.metaLeads !== null) r.metaLeads += c.metaLeads;
    r.ads = (r.ads ?? 0) + 1;
    m.set(key, r);
  }
  return [...m.values()].map((r) => ({ ...r, cplFactMinor: costPerLead(r.spendMinor, r.leads) }));
}

const noMeta = <span className="text-muted-foreground">—</span>;

const view = {
  group: parseAsStringLiteral(['ad', 'campaign'] as const).withDefault('ad'),
  view: parseAsStringLiteral(['table', 'gallery'] as const).withDefault('table'),
};

export default function CreativesPage() {
  const api = useApi();
  const { workspace } = useWorkspace();
  const { range } = usePeriod();
  const [v, setV] = useQueryStates(view);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'leads', desc: true }]);
  const [showPhone, setShowPhone] = useState(false);
  const [open, setOpen] = useState<Row | null>(null);

  const q = useQuery({
    queryKey: ['creatives', workspace.id, range],
    queryFn: () =>
      api(creativesResponseSchema, `/creatives?from=${range.from}&to=${range.to}`, {
        workspaceId: workspace.id,
      }),
  });
  const currency = q.data?.spendCurrency ?? null;
  const rows = useMemo<Row[]>(
    () => (!q.data ? [] : v.group === 'campaign' ? byCampaign(q.data.items) : q.data.items),
    [q.data, v.group],
  );
  const totals = useMemo(() => {
    const spend = rows.some((r) => r.spendMinor !== null)
      ? rows.reduce((a, r) => a + (r.spendMinor ?? 0), 0)
      : null;
    const leads = rows.reduce((a, r) => a + r.leads, 0);
    return {
      leads,
      spend,
      sales: rows.reduce((a, r) => a + r.sales, 0),
      withPhone: rows.reduce((a, r) => a + r.withPhone, 0),
      cpl: costPerLead(spend, leads),
    };
  }, [rows]);

  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      {
        id: 'name',
        header: v.group === 'campaign' ? 'Кампания' : 'Объявление',
        accessorFn: (r) => adTitle(r),
        cell: ({ row: { original: r } }) => (
          <div className="flex min-w-0 items-center gap-3">
            <div
              className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted"
              aria-hidden
            >
              <ImageIcon className="size-4 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <div className="truncate font-medium">{adTitle(r)}</div>
              <div className="truncate text-xs text-muted-foreground">
                {r.ads
                  ? `${r.ads} объявл.`
                  : [r.campaignName, r.adsetName].filter(Boolean).join(' › ') || '—'}
              </div>
            </div>
          </div>
        ),
      },
      {
        id: 'spend',
        header: 'Расход',
        accessorFn: (r) => r.spendMinor ?? -1,
        cell: ({ row: { original: r } }) =>
          r.spendMinor === null ? noMeta : money(r.spendMinor, currency),
      },
      {
        id: 'leads',
        header: 'Лиды · факт',
        accessorFn: (r) => r.leads,
        cell: (c) => int(c.getValue<number>()),
      },
      {
        id: 'cpl',
        header: 'Цена · факт',
        accessorFn: (r) => r.cplFactMinor ?? Number.MAX_SAFE_INTEGER,
        cell: ({ row: { original: r } }) =>
          r.cplFactMinor === null ? noMeta : money(r.cplFactMinor, currency),
      },
      {
        id: 'metaLeads',
        header: 'Лиды · Meta',
        accessorFn: (r) => r.metaLeads ?? -1,
        cell: ({ row: { original: r } }) => (r.metaLeads === null ? noMeta : int(r.metaLeads)),
      },
      {
        id: 'cplMeta',
        header: 'Цена · Meta',
        accessorFn: (r) => costPerLead(r.spendMinor, r.metaLeads) ?? Number.MAX_SAFE_INTEGER,
        cell: ({ row: { original: r } }) => {
          const c = costPerLead(r.spendMinor, r.metaLeads);
          return c === null ? noMeta : money(c, currency);
        },
      },
      ...(showPhone
        ? [
            {
              id: 'phone',
              header: 'С телефоном',
              accessorFn: (r: Row) => r.withPhone,
              cell: (c) => int(c.getValue<number>()),
            } as ColumnDef<Row>,
          ]
        : []),
      {
        id: 'sales',
        header: 'Продажи',
        accessorFn: (r) => r.sales,
        cell: (c) => int(c.getValue<number>()),
      },
    ],
    [currency, showPhone, v.group],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <>
      <PageHeader
        title="Креативы"
        description="Лиды и продажи по объявлениям; расход и цена — из Meta Ads"
        actions={<PeriodBar />}
      />
      {/* Два независимых переключателя: подписаны и разнесены, кнопки внутри группы слиты в сегмент. */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Группировка</span>
          <ToggleGroup
            variant="segment"
            size="sm"
            value={[v.group]}
            onValueChange={(x: string[]) => x[0] && void setV({ group: x[0] as 'ad' | 'campaign' })}
            aria-label="Группировка"
          >
            <ToggleGroupItem value="ad">По объявлениям</ToggleGroupItem>
            <ToggleGroupItem value="campaign">По кампаниям</ToggleGroupItem>
          </ToggleGroup>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Вид</span>
          <ToggleGroup
            variant="segment"
            size="sm"
            value={[v.view]}
            onValueChange={(x: string[]) =>
              x[0] && void setV({ view: x[0] as 'table' | 'gallery' })
            }
            aria-label="Вид"
          >
            <ToggleGroupItem value="table">
              <TableIcon aria-hidden /> Таблица
            </ToggleGroupItem>
            <ToggleGroupItem value="gallery">
              <LayoutGrid aria-hidden /> Галерея
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        <label className="ml-auto flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={showPhone}
            onChange={(e) => setShowPhone(e.target.checked)}
          />
          Колонка «С телефоном»
        </label>
      </div>

      {q.isPending ? (
        <LoadingState rows={4} />
      ) : q.isError ? (
        <ErrorState message={q.error.message} onRetry={() => void q.refetch()} />
      ) : !rows.length ? (
        <EmptyState title="Нет рекламных лидов" description="За период нет лидов с рекламы." />
      ) : v.view === 'gallery' ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {table.getRowModel().rows.map(({ original: r }) => (
            <button key={r.adKey} type="button" className="text-left" onClick={() => setOpen(r)}>
              <Card className="h-full transition-colors hover:bg-accent/40">
                <div
                  className="flex aspect-video items-center justify-center rounded-t-xl bg-muted"
                  aria-hidden
                >
                  <ImageIcon className="size-8 text-muted-foreground" />
                </div>
                <CardContent className="flex flex-col gap-1 pt-3">
                  <div className="truncate font-medium">{adTitle(r)}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {[r.campaignName, r.adsetName].filter(Boolean).join(' › ') || ' '}
                  </div>
                  <div className="flex justify-between text-sm tabular-nums">
                    <span>{int(r.leads)} лидов</span>
                    <span>
                      {r.cplFactMinor === null
                        ? `продаж ${r.sales}`
                        : `${money(r.cplFactMinor, currency)} / лид`}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </button>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id}>
                  {hg.headers.map((h) => (
                    <TableHead key={h.id} className={h.id === 'name' ? 'min-w-64' : 'text-right'}>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1"
                        onClick={h.column.getToggleSortingHandler()}
                      >
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        <ArrowUpDown className="size-3 opacity-50" aria-hidden />
                      </button>
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() => setOpen(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={cell.column.id === 'name' ? 'max-w-80' : 'text-right tabular-nums'}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>Итого · {rows.length}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {totals.spend === null ? '—' : money(totals.spend, currency)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{int(totals.leads)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {totals.cpl === null ? '—' : money(totals.cpl, currency)}
                </TableCell>
                <TableCell />
                <TableCell />
                {showPhone && (
                  <TableCell className="text-right tabular-nums">{int(totals.withPhone)}</TableCell>
                )}
                <TableCell className="text-right tabular-nums">{int(totals.sales)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}
      <CreativePanel row={open} onClose={() => setOpen(null)} currency={currency} />
    </>
  );
}

/** Боковая панель креатива: лиды по дням и последние лиды. */
function CreativePanel({
  row,
  onClose,
  currency,
}: {
  row: Row | null;
  onClose: () => void;
  currency: string | null;
}) {
  const api = useApi();
  const { workspace } = useWorkspace();
  const { range } = usePeriod();
  const href = usePeriodHref();
  const isAd = !!row && !row.ads;
  const q = useQuery({
    queryKey: ['creative-leads', workspace.id, range, row?.adKey],
    queryFn: () =>
      api(
        leadsResponseSchema,
        `/leads?from=${range.from}&to=${range.to}&metric=adLeads&adKey=${encodeURIComponent(row!.adKey)}&limit=500`,
        { workspaceId: workspace.id },
      ),
    enabled: isAd,
  });
  const byDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of q.data?.items ?? []) m.set(l.day, (m.get(l.day) ?? 0) + 1);
    return [...m.entries()].sort();
  }, [q.data]);
  const max = Math.max(1, ...byDay.map(([, n]) => n));

  return (
    <Sheet open={!!row} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {row && (
          <>
            <SheetHeader>
              <SheetTitle>{adTitle(row)}</SheetTitle>
              <SheetDescription>
                {[row.campaignName, row.adsetName].filter(Boolean).join(' › ') || ' '}
              </SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-4 px-4 pb-6">
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <dt className="text-muted-foreground">Лиды · факт</dt>
                <dd className="text-right tabular-nums">{int(row.leads)}</dd>
                <dt className="text-muted-foreground">С телефоном</dt>
                <dd className="text-right tabular-nums">{int(row.withPhone)}</dd>
                <dt className="text-muted-foreground">Продажи</dt>
                <dd className="text-right tabular-nums">{int(row.sales)}</dd>
                <dt className="text-muted-foreground">Расход</dt>
                <dd className="text-right">
                  {row.spendMinor === null ? 'нет данных с Meta' : money(row.spendMinor, currency)}
                </dd>
              </dl>
              {isAd && (
                <>
                  <div>
                    <div className="mb-2 text-sm font-medium">Лиды по дням</div>
                    {q.isPending ? (
                      <LoadingState rows={1} />
                    ) : (
                      <div className="flex h-24 items-end gap-1" aria-label="Лиды по дням">
                        {byDay.map(([d, n]) => (
                          <div key={d} className="flex-1" title={`${d}: ${n}`}>
                            <div
                              className="rounded-t bg-[var(--chart-1)]"
                              style={{ height: `${(n / max) * 88}px` }}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <Button
                    render={<Link href={href('/leads', { metric: 'adLeads', adKey: row.adKey })} />}
                    variant="outline"
                  >
                    Все лиды этого объявления
                  </Button>
                </>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
