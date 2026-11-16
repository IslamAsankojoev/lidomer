'use client';

import { useQuery } from '@tanstack/react-query';
import type { z } from 'zod';
import { useApi } from '@/lib/api';
import { useWorkspace } from '@/lib/workspace';

/** Запрос к api в контексте выбранной компании. */
export function useWorkspaceQuery<S extends z.ZodType>(schema: S, path: string, enabled = true) {
  const api = useApi();
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: [path, workspace.id],
    queryFn: () => api(schema, path, { workspaceId: workspace.id }),
    enabled,
  });
}
