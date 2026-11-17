'use client';

import { PERIOD_LABELS, PERIOD_PRESETS, type PeriodPreset } from '@lidomer/shared';
import { format, parseISO } from 'date-fns';
import { useEffect, useRef } from 'react';
import { ru } from 'date-fns/locale';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { usePeriod } from '@/lib/period';

const fmt = (d: string) => format(parseISO(d), 'd MMM yyyy', { locale: ru });

/** «16 нояб. 2026» или «1 нояб. 2026 — 16 нояб. 2026». */
export function formatPeriod({ from, to }: { from: string; to: string }): string {
  return from === to ? fmt(from) : `${fmt(from)} — ${fmt(to)}`;
}

/** Панель периода: сегмент и даты под ним. Стоит справа от заголовка страницы. Значение живёт в URL. */
export function PeriodBar() {
  const { preset, range, setState } = usePeriod();
  // На телефоне кнопки периода прокручиваются в строку — выбранная всегда в поле зрения.
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current
      ?.querySelector('[data-pressed]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [preset]);

  const choose = (next: PeriodPreset) => {
    if (next === 'custom') void setState({ period: 'custom', from: range.from, to: range.to });
    else void setState({ period: next, from: null, to: null });
  };

  return (
    <div ref={ref} className="flex min-w-0 flex-col gap-1.5 sm:items-end">
      <ToggleGroup
        variant="segment"
        size="sm"
        value={[preset]}
        onValueChange={(v: string[]) => {
          const next = v[0] as PeriodPreset | undefined;
          if (next) choose(next);
        }}
        aria-label="Период"
        // На телефоне сегмент прокручивается в строку, выбранный всегда в поле зрения.
        className="max-w-full flex-nowrap overflow-x-auto [scrollbar-width:none]"
      >
        {PERIOD_PRESETS.map((p) => (
          <ToggleGroupItem key={p} value={p}>
            {PERIOD_LABELS[p]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {preset === 'custom' ? (
        <div className="flex items-center gap-1">
          <Input
            type="date"
            aria-label="Начало периода"
            className="h-8 w-36"
            value={range.from}
            max={range.to}
            onChange={(e) =>
              e.target.value &&
              void setState({ period: 'custom', from: e.target.value, to: range.to })
            }
          />
          <span className="text-muted-foreground">—</span>
          <Input
            type="date"
            aria-label="Конец периода"
            className="h-8 w-36"
            value={range.to}
            min={range.from}
            onChange={(e) =>
              e.target.value &&
              void setState({ period: 'custom', from: range.from, to: e.target.value })
            }
          />
        </div>
      ) : (
        <span className="text-xs text-muted-foreground sm:text-sm" data-testid="period-range">
          {formatPeriod(range)}
        </span>
      )}
    </div>
  );
}
