'use client';

import {
  type ReportInput,
  reportRunsResponseSchema,
  reportsResponseSchema,
  telegramChatsResponseSchema,
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
  const chats = useQuery({
    queryKey: ['tg-chats', workspace.id],
    queryFn: () => api(telegramChatsResponseSchema, '/telegram/chats', opts),
  });
  const runs = useQuery({
    queryKey: ['report-runs', workspace.id],
    queryFn: () => api(reportRunsResponseSchema, '/reports/runs', opts),
    refetchInterval: 30_000,
  });
  return { reports, chats, runs };
}

export function useReportActions() {
  const api = useApi();
  const { workspace } = useWorkspace();
  const qc = useQueryClient();
  const opts = { workspaceId: workspace.id };
  const refresh = () =>
    qc.invalidateQueries({
      predicate: (q) => ['reports', 'report-runs', 'tg-chats'].includes(String(q.queryKey[0])),
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
    test: useMutation({
      mutationFn: ({
        id,
        chatId,
        threadId,
      }: {
        id: string;
        chatId: string;
        threadId: string | null;
      }) =>
        api(z.object({ status: z.string(), error: z.string().nullable() }), `/reports/${id}/test`, {
          ...opts,
          method: 'POST',
          body: { chatId, threadId },
        }),
      onSuccess: async (run) => {
        if (run.status === 'sent') toast.success('Тест отправлен');
        else toast.error(run.error ?? 'Тест не отправлен — см. историю');
        await refresh();
      },
      onError,
    }),
    alertChat: useMutation({
      mutationFn: (chatId: string | null) =>
        api(z.null(), '/telegram/alert-chat', { ...opts, method: 'PUT', body: { chatId } }),
      onSuccess: async () => {
        toast.success('Группа алертов сохранена');
        await refresh();
      },
      onError,
    }),
    setup: useMutation({
      mutationFn: () =>
        api(z.object({ ok: z.boolean() }), '/telegram/setup', { ...opts, method: 'POST' }),
      onSuccess: async () => {
        toast.success('Бот подключён к кабинету');
        await refresh();
      },
      onError,
    }),
  };
}
