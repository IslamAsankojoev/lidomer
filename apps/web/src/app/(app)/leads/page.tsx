'use client';

import {
  DEAL_STATUS_LABELS,
  DEAL_STATUSES,
  LEAD_CHANNEL_LABELS,
  LEAD_CHANNELS,
  LEAD_FLAG_LABELS,
  LEAD_FLAGS,
  LEAD_METRICS,
  leadsResponseSchema,
} from '@lidomer/shared';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { parseAsInteger, parseAsString, parseAsStringLiteral, useQueryStates } from 'nuqs';
import { PageHeader } from '@/components/page-header';
import { PeriodBar } from '@/components/period-bar';
import { ListSkeleton, TableSkeleton } from '@/components/skeletons';
import { EmptyState, ErrorState, LoadingState } from '@/components/state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useApi } from '@/lib/api';
import { int, money } from '@/lib/format';
import { usePeriod } from '@/lib/period';
import { exportCsv, exportXlsx } from '@/lib/export';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/lib/workspace';
import { LeadDialog } from './lead-dialog';
import { SourceBadge, SourceLogo } from '@/components/source-badge';

const PAGE = 50;
const METRIC_LABELS: Record<(typeof LEAD_METRICS)[number], string> = {
  adLeads: 'Лиды с рекламы',
  organicLeads: 'Органика',
  directUnknownLeads: 'Direct, источник не определён',
  otherLeads: 'Другие каналы',
  totalLeads: 'Все лиды',
  repeats: 'Повторные обращения',
  withPhone: 'С телефоном',
  sales: 'Продажи',
};

/** Ward кладёт в имя Instagram — не повторяем его второй строкой. */
const sameAsName = (l: { name: string | null; instagram: string | null }) =>
  !!l.name && l.name.replace(/^@/, '').toLowerCase() === l.instagram;

/** Объявление без названия (Meta не подключена): короткий id вместо 18 цифр. */
const adLabel = (key: string | null) =>
  !key ? '—' : /^\d{10,}$/.test(key) ? `Объявление #…${key.slice(-6)}` : key;

const filters = {
  metric: parseAsStringLiteral(LEAD_METRICS),
  channel: parseAsStringLiteral(LEAD_CHANNELS),
  status: parseAsStringLiteral(DEAL_STATUSES),
  flag: parseAsStringLiteral(LEAD_FLAGS),
  adKey: parseAsString,
  page: parseAsInteger.withDefault(0),
};

function FilterSelect<T extends string>(props: {
  label: string;
  value: T | null;
  options: readonly T[];
  labels: Record<T, string>;
  onChange: (v: T | null) => void;
}) {
  return (
    <select
      aria-label={props.label}
      value={props.value ?? ''}
      onChange={(e) => props.onChange((e.target.value || null) as T | null)}
      className="h-8 w-full min-w-0 rounded-lg border border-input bg-card px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:w-44 dark:bg-input/30"
    >
      <option value="">{props.label}: все</option>
      {props.options.map((o) => (
        <option key={o} value={o}>
          {props.labels[o]}
        </option>
      ))}
    </select>
  );
}

export default function LeadsPage() {
  const api = useApi();
  const { workspace } = useWorkspace();
  const { range } = usePeriod();
  const [f, setF] = useQueryStates(filters);

  const params = new URLSearchParams({
    from: range.from,
    to: range.to,
    limit: String(PAGE),
    offset: String(f.page * PAGE),
  });
  if (f.metric) params.set('metric', f.metric);
  if (f.channel) params.set('channel', f.channel);
  if (f.status) params.set('status', f.status);
  if (f.flag) params.set('flag', f.flag);
  if (f.adKey) params.set('adKey', f.adKey);

  const q = useQuery({
    queryKey: ['leads', workspace.id, params.toString()],
    queryFn: () =>
      api(leadsResponseSchema, `/leads?${params.toString()}`, { workspaceId: workspace.id }),
    placeholderData: (prev) => prev,
  });
  const set = (patch: Partial<typeof f>) => void setF({ ...patch, page: 0 });
  const [openId, setOpenId] = useState<string | null>(null);
  // Новые фильтры грузятся — прежний список виден, но приглушён: ясно, что он устарел.
  const stale = q.isPlaceholderData && 'pointer-events-none opacity-50';
  const [exporting, setExporting] = useState(false);

  /** Выгрузка всех лидов по текущим фильтрам (не только страницы). */
  const runExport = async (kind: 'csv' | 'xlsx') => {
    setExporting(true);
    try {
      const all = [];
      for (let offset = 0; ; offset += 500) {
        const p = new URLSearchParams(params);
        p.set('limit', '500');
        p.set('offset', String(offset));
        const page = await api(leadsResponseSchema, `/leads?${p.toString()}`, {
          workspaceId: workspace.id,
        });
        all.push(...page.items);
        if (all.length >= page.total || !page.items.length) break;
      }
      const name = `лиды_${range.from}_${range.to}`;
      if (kind === 'csv') exportCsv(all, name);
      else await exportXlsx(all, name);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Не удалось выгрузить');
    } finally {
      setExporting(false);
    }
  };
  const pages = q.data ? Math.max(1, Math.ceil(q.data.total / PAGE)) : 1;

  return (
    <>
      <PageHeader
        title="Лиды"
        description={
          f.metric
            ? `Из чего сложилось: «${METRIC_LABELS[f.metric]}» — ${q.data ? int(q.data.total) : '…'}`
            : 'Единый журнал: лид WARD со своей сделкой или сделка Bitrix24 без WARD'
        }
        actions={<PeriodBar />}
      />
      {/* На телефоне — сетка 2×2 одинаковых полей, на широком экране — одна строка. */}
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <FilterSelect
          label="Цифра"
          value={f.metric}
          options={LEAD_METRICS}
          labels={METRIC_LABELS}
          onChange={(v) => set({ metric: v })}
        />
        <FilterSelect
          label="Канал"
          value={f.channel}
          options={LEAD_CHANNELS}
          labels={LEAD_CHANNEL_LABELS}
          onChange={(v) => set({ channel: v })}
        />
        <FilterSelect
          label="Статус"
          value={f.status}
          options={DEAL_STATUSES}
          labels={DEAL_STATUS_LABELS}
          onChange={(v) => set({ status: v })}
        />
        <FilterSelect
          label="Проблема"
          value={f.flag}
          options={LEAD_FLAGS}
          labels={LEAD_FLAG_LABELS}
          onChange={(v) => set({ flag: v })}
        />
        {(f.metric || f.channel || f.status || f.flag || f.adKey) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              set({ metric: null, channel: null, status: null, flag: null, adKey: null })
            }
          >
            Сбросить
          </Button>
        )}
        <div className="col-span-2 flex gap-2 sm:ml-auto">
          <Button
            variant="outline"
            size="sm"
            disabled={exporting}
            onClick={() => void runExport('csv')}
          >
            <Download className="size-4" /> CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={exporting}
            onClick={() => void runExport('xlsx')}
          >
            <Download className="size-4" /> Excel
          </Button>
        </div>
      </div>

      {q.isPending ? (
        // Та же форма, что у списка: карточки на телефоне, таблица на компьютере.
        <LoadingState>
          <div className="rounded-xl border bg-card shadow-[0_1px_2px_0_rgb(0_0_0/0.04)] sm:hidden">
            <ListSkeleton rows={8} inset />
          </div>
          <div className="hidden rounded-xl border bg-card shadow-[0_1px_2px_0_rgb(0_0_0/0.04)] sm:block">
            <TableSkeleton
              columns={['Когда', 'Клиент', 'Канал', 'Объявление', 'Сделка', 'Проблемы']}
              rows={10}
            />
          </div>
        </LoadingState>
      ) : q.isError ? (
        <ErrorState message={q.error.message} onRetry={() => void q.refetch()} />
      ) : !q.data.items.length ? (
        <EmptyState
          title="Лидов нет"
          description="За выбранный период с такими фильтрами лидов нет."
        />
      ) : (
        <>
          {/* Телефон: список карточек вместо широкой таблицы, без прокрутки вбок. */}
          <ul
            aria-busy={q.isPlaceholderData}
            className={cn(
              'flex flex-col divide-y rounded-xl border bg-card shadow-[0_1px_2px_0_rgb(0_0_0/0.04)] transition-opacity sm:hidden',
              stale,
            )}
          >
            {q.data.items.map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(l.id)}
                  className="flex w-full flex-col gap-1 px-3 py-2.5 text-left text-sm active:bg-muted/60"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate font-medium">{l.name ?? '—'}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {format(parseISO(l.createdAt), 'd MMM, HH:mm', { locale: ru })}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <SourceLogo
                        source={l.origin === 'ward' ? 'ward' : 'bitrix24'}
                        className="size-3.5"
                      />
                      <span className="truncate">
                        {LEAD_CHANNEL_LABELS[l.channel]}
                        {l.isRepeat && ' · повтор'}
                      </span>
                    </span>
                    <span className="shrink-0">
                      {l.dealId ? `№${l.dealId} · ${DEAL_STATUS_LABELS[l.status]}` : 'нет сделки'}
                    </span>
                  </div>
                  {l.flags.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {l.flags.map((fl) => (
                        <Badge key={fl} variant="secondary" className="text-[11px]">
                          {LEAD_FLAG_LABELS[fl]}
                        </Badge>
                      ))}
                    </div>
                  )}
                </button>
              </li>
            ))}
          </ul>
          <div
            aria-busy={q.isPlaceholderData}
            className={cn(
              'hidden overflow-x-auto rounded-xl border bg-card shadow-[0_1px_2px_0_rgb(0_0_0/0.04)] transition-opacity sm:block',
              stale,
            )}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Когда</TableHead>
                  <TableHead>Клиент</TableHead>
                  <TableHead>Канал</TableHead>
                  <TableHead>Объявление</TableHead>
                  <TableHead>Сделка</TableHead>
                  <TableHead>Проблемы</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.data.items.map((l) => (
                  <TableRow key={l.id} className="cursor-pointer" onClick={() => setOpenId(l.id)}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {format(parseISO(l.createdAt), 'd MMM, HH:mm', { locale: ru })}
                    </TableCell>
                    <TableCell className="max-w-44">
                      <div className="truncate text-sm">{l.name ?? '—'}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {[l.phone, l.instagram && !sameAsName(l) && `@${l.instagram}`]
                          .filter(Boolean)
                          .join(' · ') || 'нет контактов'}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {LEAD_CHANNEL_LABELS[l.channel]}
                      {l.isRepeat && (
                        <Badge variant="outline" className="ml-1">
                          повтор
                        </Badge>
                      )}
                      <div className="mt-1">
                        <SourceBadge
                          source={l.origin === 'ward' ? 'ward' : 'bitrix24'}
                          variant="pill"
                        />
                      </div>
                    </TableCell>
                    <TableCell className="max-w-52 text-sm">
                      <div className="truncate">
                        {l.adName ?? (l.channel === 'ad' ? adLabel(l.adKey) : '—')}
                      </div>
                      {l.campaignName && (
                        <div className="truncate text-xs text-muted-foreground">
                          {l.campaignName} › {l.adsetName}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {l.dealId ? (
                        <>
                          <div className="whitespace-nowrap">
                            №{l.dealId} · {DEAL_STATUS_LABELS[l.status]}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {l.stageName}
                            {l.amountMinor !== null && ` · ${money(l.amountMinor, l.currency)}`}
                          </div>
                        </>
                      ) : (
                        <span className="text-muted-foreground">нет сделки</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {l.flags.map((fl) => (
                          <Badge key={fl} variant="secondary" className="text-[11px]">
                            {LEAD_FLAG_LABELS[fl]}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Всего {int(q.data.total)} · страница {f.page + 1} из {pages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={f.page === 0}
                onClick={() => void setF({ page: f.page - 1 })}
              >
                Назад
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={f.page + 1 >= pages}
                onClick={() => void setF({ page: f.page + 1 })}
              >
                Дальше
              </Button>
            </div>
          </div>
        </>
      )}
      <LeadDialog id={openId} onClose={() => setOpenId(null)} onOpenLead={setOpenId} />
    </>
  );
}
