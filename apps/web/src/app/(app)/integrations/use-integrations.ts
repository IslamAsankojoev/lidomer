'use client';

import {
  type IntegrationSummary,
  integrationSummarySchema,
  integrationsResponseSchema,
  type IntegrationType,
  syncRunsResponseSchema,
} from '@lidomer/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useApi } from '@/lib/api';
import { useWorkspace } from '@/lib/workspace';

/** Список подключений. Пока идёт синхронизация — обновляется каждые 5 секунд. */
export function useIntegrations() {
  const api = useApi();
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ['integrations', workspace.id],
    queryFn: () => api(integrationsResponseSchema, '/integrations', { workspaceId: workspace.id }),
    refetchInterval: (q) =>
      q.state.data?.integrations.some((i) => i.pendingJobs > 0 || i.status === 'syncing')
        ? 5000
        : false,
  });
}

export function useSyncRuns(type: IntegrationType, enabled: boolean) {
  const api = useApi();
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ['integration-runs', workspace.id, type],
    queryFn: () =>
      api(syncRunsResponseSchema, `/integrations/${type}/runs`, { workspaceId: workspace.id }),
    enabled,
    refetchInterval: 10_000,
  });
}

type Action = 'connect' | 'test' | 'sync' | 'disconnect';
const SUCCESS: Record<Action, string> = {
  connect: 'Подключено. Загружаем историю — это займёт несколько минут.',
  test: 'Проверка выполнена',
  sync: 'Синхронизация поставлена в очередь',
  disconnect: 'Отключено. Ключи удалены, загруженные данные остались.',
};

export function useIntegrationAction(type: IntegrationType) {
  const api = useApi();
  const { workspace } = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      action,
      body,
    }: {
      action: Action;
      body?: unknown;
    }): Promise<IntegrationSummary> => {
      const opts = { workspaceId: workspace.id };
      if (action === 'connect')
        return api(integrationSummarySchema, `/integrations/${type}`, {
          ...opts,
          method: 'PUT',
          body,
        });
      if (action === 'disconnect')
        return api(integrationSummarySchema, `/integrations/${type}`, {
          ...opts,
          method: 'DELETE',
        });
      return api(integrationSummarySchema, `/integrations/${type}/${action}`, {
        ...opts,
        method: 'POST',
      });
    },
    onSuccess: async (res, { action }) => {
      if (action === 'test' && res.status !== 'connected')
        toast.error(res.lastError ?? 'Проверка не прошла');
      else toast.success(SUCCESS[action]);
      await qc.invalidateQueries({ queryKey: ['integrations', workspace.id] });
      await qc.invalidateQueries({ queryKey: ['integration-runs', workspace.id, type] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
