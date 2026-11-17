'use client';

import { INTEGRATION_STATUS_LABELS, type IntegrationSummary } from '@lidomer/shared';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import {
  AlertTriangle,
  Bot,
  BriefcaseBusiness,
  ChevronDown,
  Loader2,
  Megaphone,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ConnectForm } from './connect-form';
import { RunsLog } from './runs-log';
import { StageMap } from './stage-map';
import { useIntegrationAction } from './use-integrations';
import { isBrandSource, SourceLogo } from '@/components/source-badge';

const ICONS: Record<string, LucideIcon> = {
  meta_ads: Megaphone,
  ward: Bot,
  bitrix24: BriefcaseBusiness,
};

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
      : s.pendingJobs > 0 || s.status === 'syncing'
        ? 'secondary'
        : s.status === 'connected'
          ? 'success'
          : 'outline';
  return (
    <Badge variant={variant} className="shrink-0 gap-1">
      {s.pendingJobs > 0 && <Loader2 className="size-3 animate-spin" aria-hidden />}
      {label}
    </Badge>
  );
}

/** Раскрывающийся раздел внизу карточки: строка на всю ширину со стрелкой справа. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Collapsible className="border-t">
      <CollapsibleTrigger className="group flex w-full items-center justify-between px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
        {title}
        <ChevronDown
          className="size-4 transition-transform group-data-[panel-open]:rotate-180"
          aria-hidden
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4">{children}</CollapsibleContent>
    </Collapsible>
  );
}

function Stat({ label, children, mono }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0 rounded-lg bg-muted/50 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={mono ? 'truncate font-mono text-xs leading-5' : 'truncate text-sm font-medium'}
        title={typeof children === 'string' ? children : undefined}
      >
        {children}
      </div>
    </div>
  );
}

export function IntegrationCard({ s, canManage }: { s: IntegrationSummary; canManage: boolean }) {
  const action = useIntegrationAction(s.type);
  const connected = s.status !== 'not_connected' && s.status !== 'disabled';
  const Icon = ICONS[s.type] ?? Bot;

  const disconnect = () => {
    if (confirm(`Отключить ${s.name}? Ключи будут удалены, загруженные данные останутся.`))
      action.mutate({ action: 'disconnect' });
  };

  return (
    <Card className="gap-0 pb-0">
      <CardHeader className="flex flex-row items-start gap-3 pb-4">
        {isBrandSource(s.type) ? (
          <SourceLogo source={s.type} className="size-9" />
        ) : (
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-4.5" aria-hidden />
          </div>
        )}
        <div className="min-w-0 flex-1">
          {/* Статус рядом с названием — описание не сжимается в узкую колонку. */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <CardTitle>{s.name}</CardTitle>
            <StatusBadge s={s} />
          </div>
          <CardDescription>{DESCRIPTIONS[s.type]}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pb-4">
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
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat label="Синхронизация">
              {s.lastSyncAt
                ? formatDistanceToNow(parseISO(s.lastSyncAt), { addSuffix: true, locale: ru })
                : 'ещё не было'}
            </Stat>
            {Object.entries(s.details).map(([k, v]) => (
              <Stat key={k} label={k}>
                {v}
              </Stat>
            ))}
            {Object.entries(s.maskedSecrets).map(([k, v]) => (
              <Stat key={k} label="Ключ" mono>
                <span aria-label={`Ключ ${k}, скрыт`}>{v}</span>
              </Stat>
            ))}
          </div>
        )}

        {canManage &&
          (!connected || s.status === 'reauth_required' ? (
            <ConnectForm type={s.type} />
          ) : (
            // Все действия одной строкой; «Заменить ключ» раскрывает форму под ней.
            <Collapsible className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
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
                <CollapsibleTrigger render={<Button variant="outline" size="sm" />}>
                  Заменить ключ
                </CollapsibleTrigger>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive sm:ml-auto"
                  disabled={action.isPending}
                  onClick={disconnect}
                >
                  Отключить
                </Button>
              </div>
              <CollapsibleContent>
                <ConnectForm type={s.type} reconnect />
              </CollapsibleContent>
            </Collapsible>
          ))}
      </CardContent>

      {s.type === 'bitrix24' && connected && (
        <Section title="Статусы сделок">
          <StageMap canManage={canManage} />
        </Section>
      )}
      {s.status !== 'not_connected' && (
        <Section title="Журнал запусков">
          <RunsLog type={s.type} />
        </Section>
      )}
    </Card>
  );
}
