'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  type InviteMemberRequest,
  inviteMemberRequestSchema,
  membersResponseSchema,
  ROLE_LABELS,
  ROLES,
  type Role,
} from '@lidomer/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { ErrorState, LoadingState } from '@/components/state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useApi } from '@/lib/api';
import { useWorkspace } from '@/lib/workspace';

const empty = z.null();

function RoleSelect({
  value,
  onChange,
  id,
  disabled,
  label,
}: {
  value: Role;
  onChange: (r: Role) => void;
  id?: string;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <select
      id={id}
      aria-label={label}
      disabled={disabled}
      value={value}
      onChange={(e) => onChange(e.target.value as Role)}
      className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30"
    >
      {ROLES.map((r) => (
        <option key={r} value={r}>
          {ROLE_LABELS[r]}
        </option>
      ))}
    </select>
  );
}

export function TeamCard() {
  const api = useApi();
  const { workspace } = useWorkspace();
  const queryClient = useQueryClient();
  const key = ['members', workspace.id];
  const opts = { workspaceId: workspace.id };

  const members = useQuery({
    queryKey: key,
    queryFn: () => api(membersResponseSchema, '/members', opts),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });
  const onError = (e: Error) => toast.error(e.message);

  const invite = useMutation({
    mutationFn: (body: InviteMemberRequest) =>
      api(empty, '/members/invite', { ...opts, method: 'POST', body }),
    onSuccess: async (_, body) => {
      toast.success(`Приглашение отправлено: ${body.email}`);
      form.reset({ email: '', role: body.role });
      await refresh();
    },
    onError,
  });
  const changeRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: Role }) =>
      api(empty, `/members/${userId}`, { ...opts, method: 'PATCH', body: { role } }),
    onSuccess: refresh,
    onError,
  });
  const remove = useMutation({
    mutationFn: (userId: string) => api(empty, `/members/${userId}`, { ...opts, method: 'DELETE' }),
    onSuccess: refresh,
    onError,
  });

  const form = useForm<InviteMemberRequest>({
    resolver: zodResolver(inviteMemberRequestSchema),
    defaultValues: { email: '', role: 'marketer' },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Команда</CardTitle>
        <CardDescription>
          Владелец — всё; Маркетолог — отчёты и интеграции; Продажи — лиды; Наблюдатель — только
          просмотр, телефоны в маске.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={form.handleSubmit((v) => invite.mutate(v))}
          noValidate
        >
          <Controller
            name="email"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid} className="flex-1">
                <FieldLabel htmlFor="invite-email">Email</FieldLabel>
                <Input
                  {...field}
                  id="invite-email"
                  type="email"
                  autoComplete="off"
                  aria-invalid={fieldState.invalid}
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
          <Controller
            name="role"
            control={form.control}
            render={({ field }) => (
              <Field className="sm:w-44">
                <FieldLabel htmlFor="invite-role">Роль</FieldLabel>
                <RoleSelect id="invite-role" value={field.value} onChange={field.onChange} />
              </Field>
            )}
          />
          <Button type="submit" disabled={invite.isPending}>
            {invite.isPending ? 'Отправляем…' : 'Пригласить'}
          </Button>
        </form>

        {members.isPending ? (
          <LoadingState rows={2} />
        ) : members.isError ? (
          <ErrorState message={members.error.message} onRetry={() => void members.refetch()} />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Роль</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.data.members.map((m) => (
                  <TableRow key={m.userId}>
                    <TableCell className="max-w-56 truncate">{m.email ?? '—'}</TableCell>
                    <TableCell>
                      <RoleSelect
                        label={`Роль ${m.email ?? ''}`}
                        value={m.role}
                        disabled={changeRole.isPending}
                        onChange={(role) => changeRole.mutate({ userId: m.userId, role })}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Удалить ${m.email ?? ''}`}
                        disabled={remove.isPending}
                        onClick={() => {
                          if (confirm(`Удалить ${m.email ?? 'участника'} из команды?`))
                            remove.mutate(m.userId);
                        }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
