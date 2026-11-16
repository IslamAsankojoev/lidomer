'use client';

import { INTEGRATION_STATUS_LABELS, type IntegrationSummary } from '@lidomer/shared';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { AlertTriangle, ChevronDown, Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ConnectForm } from './connect-form';
import { RunsLog } from './runs-log';
import { useIntegrationAction } from './use-integrations';

const DESCRIPTIONS: Record<string, string> = {
  meta_ads: 'Расход, показы, клики и результаты объявлений по дням',
  ward: 'Лиды и переписки бота в Instagram',
  bitrix24: 'Сделки, стадии и суммы продаж',
};

function StatusBadge({ s }: { s: IntegrationSummary }) {
  const label =
    s.pendingJobs > 0 ? `Синхронизация · ${s.pendingJobs}` : INTEGRATION_STATUS_LABELS[s.status];
  const variant =
    s.status === 'error' || s.status === 'reauth_required'
      ? 'destructive'
      : s.status === 'connected' || s.status === 'syncing'
        ? 'secondary'
        : 'outline';
  return (
    <Badge variant={variant} className="gap-1">
      {s.pendingJobs > 0 && <Loader2 className="size-3 animate-spin" aria-hidden />}
      {label}
    </Badge>
  );
}

export function IntegrationCard({ s, canManage }: { s: IntegrationSummary; canManage: boolean }) {
  const action = useIntegrationAction(s.type);
  const connected = s.status !== 'not_connected' && s.status !== 'disabled';

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle>{s.name}</CardTitle>
          <CardDescription>{DESCRIPTIONS[s.type]}</CardDescription>
        </div>
        <StatusBadge s={s} />
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {s.lastError && (
          <Alert variant="destructive">
            <AlertTriangle aria-hidden />
            <AlertTitle>
              {s.status === 'reauth_required' ? 'Нужно переподключить' : 'Ошибка синхронизации'}
            </AlertTitle>
            <AlertDescription>{s.lastError}</AlertDescription>
          </Alert>
        )}
        {s.warnings.map((w) => (
          <Alert key={w}>
            <AlertTriangle aria-hidden />
            <AlertDescription>{w}</AlertDescription>
          </Alert>
        ))}

        {connected && (
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="text-muted-foreground">Последняя синхронизация</dt>
            <dd>
              {s.lastSyncAt
                ? formatDistanceToNow(parseISO(s.lastSyncAt), { addSuffix: true, locale: ru })
                : 'ещё не было'}
            </dd>
            {Object.entries(s.details).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="break-all">{v}</dd>
              </div>
            ))}
            {Object.entries(s.maskedSecrets).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">Ключ</dt>
                <dd className="font-mono text-xs" aria-label={`Ключ ${k}, скрыт`}>
                  {v}
                </dd>
              </div>
            ))}
          </dl>
        )}

        {canManage && (
          <>
            {connected && (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={action.isPending}
                  onClick={() => action.mutate({ action: 'test' })}
                >
                  Проверить
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={action.isPending}
                  onClick={() => action.mutate({ action: 'sync' })}
                >
                  Синхронизировать
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  disabled={action.isPending}
                  onClick={() => {
                    if (
                      confirm(
                        `Отключить ${s.name}? Ключи будут удалены, загруженные данные останутся.`,
                      )
                    )
                      action.mutate({ action: 'disconnect' });
                  }}
                >
                  Отключить
                </Button>
              </div>
            )}
            {(!connected || s.status === 'reauth_required') && <ConnectForm type={s.type} />}
            {connected && s.status !== 'reauth_required' && (
              <Collapsible>
                <CollapsibleTrigger render={<Button variant="link" size="sm" className="px-0" />}>
                  Заменить ключ
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2">
                  <ConnectForm type={s.type} reconnect />
                </CollapsibleContent>
              </Collapsible>
            )}
          </>
        )}

        {s.status !== 'not_connected' && (
          <Collapsible>
            <CollapsibleTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  className="group w-fit gap-1 px-0 text-muted-foreground"
                />
              }
            >
              Журнал запусков
              <ChevronDown
                className="size-4 transition-transform group-data-[panel-open]:rotate-180"
                aria-hidden
              />
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <RunsLog type={s.type} />
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
}
