'use client';

import { apiFetch, type ApiFetchOptions } from '@lidomer/shared';
import { useCallback } from 'react';
import type { z } from 'zod';
import { env } from '@/lib/env';
import { supabaseBrowser } from '@/lib/supabase/client';

type CallOptions = Omit<ApiFetchOptions, 'baseUrl' | 'token'>;

/** Вызов api с токеном текущей сессии. Ответ проверяется zod-схемой из packages/shared. */
export function useApi() {
  return useCallback(
    async <S extends z.ZodType>(schema: S, path: string, options: CallOptions = {}) => {
      const { data } = await supabaseBrowser().auth.getSession();
      return apiFetch(schema, path, {
        ...options,
        baseUrl: env.NEXT_PUBLIC_API_URL,
        token: data.session?.access_token ?? null,
      });
    },
    [],
  );
}
