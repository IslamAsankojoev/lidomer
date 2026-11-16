'use client';

import type { IntegrationType } from '@lidomer/shared';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { ErrorState, LoadingState } from '@/components/state';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useSyncRuns } from './use-integrations';

const JOB_LABELS: Record<string, string> = {
  'ward:day': 'Лиды и переписки за день',
  'b24:stages': 'Стадии сделок',
  'b24:deals': 'Сделки',
  'meta:structure': 'Кампании и объявления',
  'meta:insights': 'Статистика объявлений',
};

const time = (iso: string) => format(parseISO(iso), 'd MMM, HH:mm:ss', { locale: ru });
const period = (from: string | null, to: string | null) =>
  !from ? '—' : from === to ? from : `${from} — ${to}`;

/** Журнал запусков синхронизации: что грузили, сколько записей, ошибка. */
export function RunsLog({ type }: { type: IntegrationType }) {
  const runs = useSyncRuns(type, true);
  if (runs.isPending) return <LoadingState rows={2} />;
  if (runs.isError)
    return <ErrorState message={runs.error.message} onRetry={() => void runs.refetch()} />;
  if (!runs.data.runs.length)
    return <p className="text-sm text-muted-foreground">Запусков ещё не было.</p>;

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Когда</TableHead>
            <TableHead>Что</TableHead>
            <TableHead>Период</TableHead>
            <TableHead className="text-right">Записей</TableHead>
            <TableHead>Итог</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.data.runs.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="whitespace-nowrap">{time(r.startedAt)}</TableCell>
              <TableCell>{JOB_LABELS[r.job] ?? r.job}</TableCell>
              <TableCell className="whitespace-nowrap">
                {period(r.periodFrom, r.periodTo)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {r.status === 'success' ? r.records : '—'}
              </TableCell>
              <TableCell className="max-w-72">
                {r.status === 'success' && <Badge variant="secondary">Готово</Badge>}
                {r.status === 'running' && <Badge variant="outline">Идёт</Badge>}
                {r.status === 'error' && (
                  <span className="text-sm text-destructive" title={r.error ?? ''}>
                    {r.error ?? 'Ошибка'}
                  </span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
