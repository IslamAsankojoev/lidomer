'use client';

import {
  type Recipient,
  type ReportInput,
  reportRunsResponseSchema,
  reportsResponseSchema,
  reportTargetsResponseSchema,
} from '@lidomer/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { z } from 'zod';
import { useApi } from '@/lib/api';
import { useWorkspace } from '@/lib/workspace';

export function useReportsData() {
  const api = useApi();
  const { workspace } = useWorkspace();
  const opts = { workspaceId: workspace.id };
  const reports = useQuery({
    queryKey: ['reports', workspace.id],
    queryFn: () => api(reportsResponseSchema, '/reports', opts),
  });
  // Куда можно отправить: Telegram и WhatsApp одним списком.
  const targets = useQuery({
    queryKey: ['report-targets', workspace.id],
    queryFn: () => api(reportTargetsResponseSchema, '/reports/targets', opts),
  });
  const runs = useQuery({
    queryKey: ['report-runs', workspace.id],
    queryFn: () => api(reportRunsResponseSchema, '/reports/runs', opts),
    refetchInterval: 30_000,
  });
  return { reports, targets, runs };
}

export function useReportActions() {
  const api = useApi();
  const { workspace } = useWorkspace();
  const qc = useQueryClient();
  const opts = { workspaceId: workspace.id };
  const refresh = () =>
    qc.invalidateQueries({
      predicate: (q) =>
        ['reports', 'report-runs', 'report-targets'].includes(String(q.queryKey[0])),
    });
  const onError = (e: Error) => toast.error(e.message);
  return {
    save: useMutation({
      mutationFn: ({ id, body }: { id?: string; body: ReportInput }) =>
        api(z.object({ id: z.string() }), id ? `/reports/${id}` : '/reports', {
          ...opts,
          method: id ? 'PUT' : 'POST',
          body,
        }),
      onSuccess: async () => {
        toast.success('Отчёт сохранён');
        await refresh();
      },
      onError,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api(z.null(), `/reports/${id}`, { ...opts, method: 'DELETE' }),
      onSuccess: refresh,
      onError,
    }),
  };
}

/** Тестовая отправка — свой экземпляр у каждого отчёта: «Отправляем…» горит только у нажатого. */
export function useTestReport() {
  const api = useApi();
  const { workspace } = useWorkspace();
  const qc = useQueryClient();
  const opts = { workspaceId: workspace.id };
  const refresh = () =>
    qc.invalidateQueries({
      predicate: (q) =>
        ['reports', 'report-runs', 'report-targets'].includes(String(q.queryKey[0])),
    });
  const onError = (e: Error) => toast.error(e.message);
  return useMutation({
    mutationFn: ({ id, to }: { id: string; to: Recipient }) =>
      api(z.object({ status: z.string(), error: z.string().nullable() }), `/reports/${id}/test`, {
        ...opts,
        method: 'POST',
        body: to,
      }),
    onSuccess: async (run) => {
      if (run.status === 'sent') toast.success('Тест отправлен');
      else toast.error(run.error ?? 'Тест не отправлен — см. историю');
      await refresh();
    },
    onError,
  });
}
