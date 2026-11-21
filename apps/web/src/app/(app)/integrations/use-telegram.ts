'use client';

import { telegramChatsResponseSchema } from '@lidomer/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { z } from 'zod';
import { useApi } from '@/lib/api';
import { useWorkspace } from '@/lib/workspace';

/** Группы Telegram компании, код привязки и группа алертов. Ключ `tg-chats` — общий с «Отчётами». */
export function useTelegramChats() {
  const api = useApi();
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ['tg-chats', workspace.id],
    queryFn: () =>
      api(telegramChatsResponseSchema, '/telegram/chats', { workspaceId: workspace.id }),
  });
}

export function useTelegramActions() {
  const api = useApi();
  const { workspace } = useWorkspace();
  const qc = useQueryClient();
  const opts = { workspaceId: workspace.id };
  const refresh = () => qc.invalidateQueries({ queryKey: ['tg-chats', workspace.id] });
  const onError = (e: Error) => toast.error(e.message);
  return {
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
