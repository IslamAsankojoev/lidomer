'use client';

import { type Period, PERIOD_PRESETS, periodSchema, resolvePreset } from '@lidomer/shared';
import { parseAsString, parseAsStringLiteral, useQueryStates } from 'nuqs';
import { useMemo } from 'react';
import { useWorkspace } from '@/lib/workspace';

const periodParsers = {
  period: parseAsStringLiteral(PERIOD_PRESETS).withDefault('last7'),
  from: parseAsString,
  to: parseAsString,
};

/**
 * Период из URL (?period=week или ?period=custom&from=…&to=…) — ссылкой можно поделиться,
 * переживает перезагрузку. Даты считаются в поясе компании.
 */
export function usePeriod() {
  const { workspace } = useWorkspace();
  const [state, setState] = useQueryStates(periodParsers);

  const range = useMemo<Period>(() => {
    if (state.period === 'custom') {
      const parsed = periodSchema.safeParse({ from: state.from, to: state.to });
      if (parsed.success) return parsed.data;
      return resolvePreset('last7', workspace.timezone);
    }
    return resolvePreset(state.period, workspace.timezone);
  }, [state.period, state.from, state.to, workspace.timezone]);

  return { preset: state.period, range, setState };
}
