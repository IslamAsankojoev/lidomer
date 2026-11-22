'use client';

import { createWorkspaceRequestSchema, type MeResponse } from '@lidomer/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, LogOut } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useApi } from '@/lib/api';
import { useSignOut } from '@/lib/use-sign-out';
import { selectWorkspace } from '@/lib/workspace';

/**
 * Вошёл, но ни в одной компании не состоит: создать свою (станет владельцем) или выйти
 * и войти под другой почтой. Без этого экрана человек застревал без выхода.
 */
export function CreateWorkspace() {
  const api = useApi();
  const qc = useQueryClient();
  const signOut = useSignOut();
  const email = qc.getQueryData<MeResponse>(['me'])?.user.email ?? null;
  const [name, setName] = useState('');
  const create = useMutation({
    mutationFn: () =>
      api(z.object({ id: z.string() }), '/workspaces', {
        method: 'POST',
        body: createWorkspaceRequestSchema.parse({ name }),
      }),
    onSuccess: async ({ id }) => {
      selectWorkspace(id);
      await qc.invalidateQueries({ queryKey: ['me'] });
      toast.success('Компания создана');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Building2 className="size-5" aria-hidden />
        </div>
        <CardTitle>Вы пока не участник ни одной компании</CardTitle>
        <CardDescription>
          Создайте свою компанию — вы станете её владельцем и сможете подключить источники и
          пригласить команду. Если вас должны были пригласить — попросите владельца отправить
          приглашение на {email ? <b>{email}</b> : 'вашу почту'}.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create.mutate();
          }}
        >
          <Field>
            <FieldLabel htmlFor="ws-name">Название компании</FieldLabel>
            <Input
              id="ws-name"
              autoComplete="organization"
              maxLength={80}
              placeholder="Например, Ala-too"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <FieldDescription>
              Часовой пояс — Бишкек; поменять его и название можно в «Настройках».
            </FieldDescription>
          </Field>
          <Button type="submit" disabled={create.isPending || !name.trim()}>
            {create.isPending ? 'Создаём…' : 'Создать компанию'}
          </Button>
        </form>
        <Button variant="ghost" onClick={() => void signOut()}>
          <LogOut className="size-4" aria-hidden /> Выйти и войти под другой почтой
        </Button>
      </CardContent>
    </Card>
  );
}
