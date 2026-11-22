'use client';

import { can, type ConnectGreenApiRequest, INTEGRATION_STATUS_LABELS } from '@lidomer/shared';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { AlertTriangle, MessageCircle } from 'lucide-react';
import { useState } from 'react';
import { ErrorState } from '@/components/state';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmButton } from '@/components/confirm-button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useWorkspace } from '@/lib/workspace';
import { ApiBadge, HowItWorks, IntegrationCardSkeleton, Section, Stat } from './integration-card';
import { INTEGRATION_INFO } from './integration-info';
import { useWhatsapp, useWhatsappActions } from './use-whatsapp';

const info = INTEGRATION_INFO.green_api;

/** Поля — с подписями как в консоли Green API. Ключи уходят только в api. */
const FIELDS: { key: keyof ConnectGreenApiRequest; placeholder: string; secret?: boolean }[] = [
  { key: 'apiUrl', placeholder: 'https://1101.api.greenapi.com' },
  { key: 'mediaUrl', placeholder: 'https://1101.media.greenapi.com' },
  { key: 'idInstance', placeholder: '1101000001' },
  { key: 'apiTokenInstance', placeholder: 'токен из консоли', secret: true },
];
const EMPTY: ConnectGreenApiRequest = {
  apiUrl: '',
  mediaUrl: '',
  idInstance: '',
  apiTokenInstance: '',
};

function KeysForm({ replace }: { replace?: boolean }) {
  const { connect } = useWhatsappActions();
  const [v, setV] = useState(EMPTY);
  const filled = FIELDS.every((f) => v[f.key].trim());
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        connect.mutate(v, { onSuccess: () => setV(EMPTY) });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <Field key={f.key}>
            <FieldLabel htmlFor={`green-${f.key}`} className="font-mono">
              {f.key}
            </FieldLabel>
            <Input
              id={`green-${f.key}`}
              type={f.secret ? 'password' : 'text'}
              autoComplete="off"
              spellCheck={false}
              placeholder={f.placeholder}
              value={v[f.key]}
              onChange={(e) => setV({ ...v, [f.key]: e.target.value })}
            />
          </Field>
        ))}
      </div>
      <div>
        <Button type="submit" disabled={connect.isPending || !filled}>
          {connect.isPending ? 'Проверяем…' : replace ? 'Заменить ключи' : 'Подключить'}
        </Button>
      </div>
    </form>
  );
}

/** WhatsApp через Green API: номер компании, его группы, ключи инстанса. */
export function WhatsappCard() {
  const { workspace } = useWorkspace();
  const canManage = can(workspace.role, 'integrations:manage');
  const q = useWhatsapp();
  const actions = useWhatsappActions();
  if (q.isPending) return <IntegrationCardSkeleton />;
  if (q.isError) return <ErrorState message={q.error.message} onRetry={() => void q.refetch()} />;
  const s = q.data;
  const connected = s.status !== 'not_connected' && s.status !== 'disabled';
  const variant =
    s.status === 'connected'
      ? 'success'
      : s.status === 'error' || s.status === 'reauth_required'
        ? 'destructive'
        : 'outline';

  return (
    <Card className="gap-0 pb-0">
      <CardHeader className="flex flex-row items-start gap-3 pb-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success">
          <MessageCircle className="size-4.5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <CardTitle>WhatsApp</CardTitle>
            <Badge variant={variant} className="shrink-0">
              {s.status === 'connected'
                ? `Подключено · групп ${s.groups.length}`
                : INTEGRATION_STATUS_LABELS[s.status]}
            </Badge>
            <ApiBadge info={info} />
          </div>
          <CardDescription>{info.summary} · Green API</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pb-4 text-sm">
        {s.lastError && (
          <Alert variant="destructive">
            <AlertTriangle aria-hidden />
            <AlertTitle>
              {s.status === 'reauth_required'
                ? 'Нужно переподключить'
                : 'Отчёты в WhatsApp не уходят'}
            </AlertTitle>
            <AlertDescription>{s.lastError}</AlertDescription>
          </Alert>
        )}
        {connected && (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Stat label="Номер">{s.phone ? `+${s.phone}` : 'не авторизован'}</Stat>
              <Stat label="Инстанс" mono>
                {s.idInstance ?? '—'}
              </Stat>
              <Stat label="Токен" mono>
                <span aria-label="Токен, скрыт">{s.maskedToken ?? '—'}</span>
              </Stat>
            </div>
            <p className="text-muted-foreground">
              Групп: {s.groups.length}
              {s.groupsUpdatedAt &&
                ` · обновлено ${formatDistanceToNow(parseISO(s.groupsUpdatedAt), { addSuffix: true, locale: ru })}`}
            </p>
            {!s.groups.length && (
              <p className="text-muted-foreground">
                Группы появляются в течение 5 минут после привязки номера. Нет нужной группы —
                добавьте в неё номер и нажмите «Обновить группы».
              </p>
            )}
          </>
        )}
        {canManage &&
          (!connected ? (
            <KeysForm />
          ) : (
            <Collapsible className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={actions.refreshGroups.isPending}
                  onClick={() => actions.refreshGroups.mutate()}
                >
                  {actions.refreshGroups.isPending ? 'Обновляем…' : 'Обновить группы'}
                </Button>
                <CollapsibleTrigger render={<Button variant="outline" size="sm" />}>
                  Заменить ключи
                </CollapsibleTrigger>
                <ConfirmButton
                  variant="ghost"
                  size="sm"
                  className="text-destructive sm:ml-auto"
                  disabled={actions.disconnect.isPending}
                  title="Отключить WhatsApp?"
                  description="Ключи будут удалены, отчёты в WhatsApp перестанут уходить."
                  confirmLabel="Отключить"
                  onConfirm={() => actions.disconnect.mutate()}
                >
                  Отключить
                </ConfirmButton>
              </div>
              <CollapsibleContent>
                <KeysForm replace />
              </CollapsibleContent>
            </Collapsible>
          ))}
      </CardContent>
      {connected && s.groups.length > 0 && (
        <Section title={`Группы номера · ${s.groups.length}`}>
          <ul className="divide-y rounded-lg border text-sm">
            {s.groups.map((g) => (
              <li key={g.id} className="truncate px-3 py-2">
                {g.name}
              </li>
            ))}
          </ul>
        </Section>
      )}
      <HowItWorks info={info} defaultOpen={!connected} />
    </Card>
  );
}
