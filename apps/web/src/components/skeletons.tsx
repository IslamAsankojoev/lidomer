import { cn } from 'cn';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/*
 * Каркасы загрузки: повторяют форму настоящих блоков, чтобы при подгрузке ничего не прыгало.
 * Оборачиваются в LoadingState (components/state.tsx) — он сообщает читалке «Загрузка…».
 * Ширины плашек чередуются по кругу (не случайно): на сервере и в браузере — одинаково.
 */

const WIDTHS = ['w-3/4', 'w-1/2', 'w-2/3', 'w-5/6', 'w-2/5', 'w-3/5'];
const width = (i: number) => WIDTHS[i % WIDTHS.length];

/** Абзац: несколько строк, последняя короче. */
export function TextSkeleton({ lines = 2, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn('h-3.5', i === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  );
}

/** Колонка: подпись; `numeric` — число справа, `action` — кнопка-значок в конце строки. */
type Column = string | { label: string; numeric?: boolean; action?: boolean };

/** Таблица: настоящие заголовки колонок, вместо ячеек — плашки; числа — справа. */
export function TableSkeleton({ columns, rows = 6 }: { columns: Column[]; rows?: number }) {
  const cols = columns.map((c) => (typeof c === 'string' ? { label: c } : c));
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {cols.map((c, i) => (
            <TableHead key={i} className={c.numeric ? 'text-right' : undefined}>
              {c.label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: rows }, (_, r) => (
          <TableRow key={r} className="hover:bg-transparent">
            {cols.map((c, i) =>
              c.action ? (
                <TableCell key={i} className="w-12">
                  <Skeleton className="ml-auto size-7 rounded-lg" />
                </TableCell>
              ) : c.numeric ? (
                <TableCell key={i}>
                  <Skeleton className="ml-auto h-4 w-12" />
                </TableCell>
              ) : (
                <TableCell key={i} className={i === 0 ? 'min-w-24' : 'min-w-20'}>
                  <Skeleton className={cn('h-4', width(r + i * 2))} />
                </TableCell>
              ),
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * Список строк с разделителями: слева название и подпись, справа — два коротких значения
 * (`text`), поле выбора (`control`) или ничего. `inset` — отступы, как у строк в рамке.
 */
export function ListSkeleton({
  rows = 5,
  trailing = 'text',
  inset = false,
  className,
}: {
  rows?: number;
  trailing?: 'text' | 'control' | 'none';
  inset?: boolean;
  className?: string;
}) {
  return (
    <ul className={cn('flex flex-col divide-y', className)}>
      {Array.from({ length: rows }, (_, i) => (
        <li
          key={i}
          className={cn('flex items-center justify-between gap-3 py-2.5', inset && 'px-3')}
        >
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className={cn('h-4', width(i))} />
            <Skeleton className={cn('h-3', width(i + 3), 'max-w-48')} />
          </div>
          {trailing === 'text' && (
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-3 w-20" />
            </div>
          )}
          {trailing === 'control' && <Skeleton className="h-8 w-36 shrink-0 rounded-lg" />}
        </li>
      ))}
    </ul>
  );
}

const BAR_WIDTHS = ['w-full', 'w-4/5', 'w-3/5', 'w-2/5', 'w-1/4', 'w-1/5'];

/** Горизонтальные полосы под подписью и числом (воронка, «Что спрашивают»). */
export function BarsSkeleton({ rows = 4, thin = false }: { rows?: number; thin?: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <div className="flex justify-between gap-3">
            <Skeleton className={cn('h-3.5', width(i + 1), 'max-w-40')} />
            <Skeleton className="h-3.5 w-8" />
          </div>
          <Skeleton
            className={cn('rounded-full', thin ? 'h-1.5' : 'h-2', BAR_WIDTHS[i % BAR_WIDTHS.length])}
          />
        </div>
      ))}
    </div>
  );
}

/** Высоты столбиков, % — «живая» неровная кривая. */
const HEIGHTS = [42, 58, 50, 66, 61, 78, 55, 70, 88, 64, 74, 60, 82, 68, 52, 72];

/** График по дням: столбики разной высоты над осью. Высоту задаёт className (h-*). */
export function ChartSkeleton({ bars = 16, className }: { bars?: number; className?: string }) {
  return (
    <div className={cn('flex items-end gap-1 border-b pb-px sm:gap-1.5', className)}>
      {Array.from({ length: bars }, (_, i) => (
        <Skeleton
          key={i}
          className="flex-1 rounded-b-none"
          style={{ height: `${HEIGHTS[i % HEIGHTS.length]}%` }}
        />
      ))}
    </div>
  );
}
