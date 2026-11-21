'use client';

import { type ConnectGreenApiRequest, whatsappStatusSchema } from '@lidomer/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { z } from 'zod';
import { useApi } from '@/lib/api';
import { useWorkspace } from '@/lib/workspace';

/** WhatsApp компании (Green API): статус, номер, группы. Токен приходит только маской. */
export function useWhatsapp() {
  const api = useApi();
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ['whatsapp', workspace.id],
    queryFn: () => api(whatsappStatusSchema, '/whatsapp', { workspaceId: workspace.id }),
  });
}

export function useWhatsappActions() {
  const api = useApi();
  const { workspace } = useWorkspace();
  const qc = useQueryClient();
  const opts = { workspaceId: workspace.id };
  // Группы WhatsApp видны и в конструкторе отчётов.
  const refresh = () =>
    qc.invalidateQueries({
      predicate: (q) => ['whatsapp', 'report-targets'].includes(String(q.queryKey[0])),
    });
  const onError = (e: Error) => toast.error(e.message);
  return {
    connect: useMutation({
      mutationFn: (body: ConnectGreenApiRequest) =>
        api(whatsappStatusSchema, '/whatsapp', { ...opts, method: 'PUT', body }),
      onSuccess: async () => {
        toast.success('WhatsApp подключён');
        await refresh();
      },
      onError,
    }),
    refreshGroups: useMutation({
      mutationFn: () => api(whatsappStatusSchema, '/whatsapp/refresh', { ...opts, method: 'POST' }),
      onSuccess: refresh,
      onError,
    }),
    disconnect: useMutation({
      mutationFn: () => api(z.null(), '/whatsapp', { ...opts, method: 'DELETE' }),
      onSuccess: async () => {
        toast.success('WhatsApp отключён');
        await refresh();
      },
      onError,
    }),
  };
}
