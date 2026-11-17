'use client';

import { can, ROLE_LABELS, updateWorkspaceRequestSchema } from '@lidomer/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useApi } from '@/lib/api';
import { useWorkspace } from '@/lib/workspace';
import { LogoField } from './logo-field';

const TIMEZONES = ['Asia/Bishkek', 'Asia/Almaty', 'Asia/Tashkent', 'Europe/Moscow', 'UTC'];

/** Компания: название и часовой пояс (по нему считаются дни). Валюта показа — из кабинета Meta. */
export function CompanyCard() {
  const api = useApi();
  const qc = useQueryClient();
  const { workspace } = useWorkspace();
  const canEdit = can(workspace.role, 'settings:manage');
  const [name, setName] = useState(workspace.name);
  const [timezone, setTimezone] = useState(workspace.timezone);
  const dirty = name !== workspace.name || timezone !== workspace.timezone;

  const save = useMutation({
    mutationFn: () => {
      const body = updateWorkspaceRequestSchema.parse({ name, timezone });
      return api(z.null(), '/workspace', { workspaceId: workspace.id, method: 'PATCH', body });
    },
    onSuccess: async () => {
      toast.success(
        timezone !== workspace.timezone
          ? 'Сохранено, дни пересчитаны по новому поясу'
          : 'Сохранено',
      );
      await qc.invalidateQueries();
      await qc.refetchQueries({ queryKey: ['me'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Компания</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <LogoField canEdit={canEdit} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="ws-name">Название</FieldLabel>
            <Input
              id="ws-name"
              value={name}
              disabled={!canEdit}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="ws-tz">Часовой пояс</FieldLabel>
            <select
              id="ws-tz"
              disabled={!canEdit}
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 dark:bg-input/30"
            >
              {[...new Set([workspace.timezone, ...TIMEZONES])].map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
            <FieldDescription>По нему считаются дни, недели и время отчётов.</FieldDescription>
          </Field>
        </div>
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="text-muted-foreground">Валюта показа</dt>
          <dd>{workspace.displayCurrency} — как в кабинете Meta, сомы справочно</dd>
          <dt className="text-muted-foreground">Ваша роль</dt>
          <dd>{ROLE_LABELS[workspace.role]}</dd>
        </dl>
        {canEdit && (
          <Button
            className="w-fit"
            disabled={!dirty || !name.trim() || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? 'Сохраняем…' : 'Сохранить'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
