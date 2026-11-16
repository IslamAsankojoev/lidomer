'use client';

import { useSearchParams } from 'next/navigation';

/** Ссылка на страницу с тем же периодом и дополнительными параметрами. */
export function usePeriodHref() {
  const params = useSearchParams();
  return (path: string, extra: Record<string, string> = {}) => {
    const next = new URLSearchParams();
    for (const k of ['period', 'from', 'to']) {
      const v = params.get(k);
      if (v) next.set(k, v);
    }
    for (const [k, v] of Object.entries(extra)) next.set(k, v);
    return `${path}?${next.toString()}`;
  };
}
