'use client';

import {
  can,
  DELIVERY_CHANNEL_LABELS,
  DELIVERY_CHANNELS,
  type DeliveryChannel,
  type ReportDto,
} from '@lidomer/shared';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { AlertTriangle, ChevronDown, Plus, Send } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { ConfirmButton } from '@/components/confirm-button';
import { EmptyState, ErrorState, LoadingState } from '@/components/state';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { useWorkspace } from '@/lib/workspace';
import { cn } from '@/lib/utils';
import { ReportBuilder, scheduleText } from './report-builder';
import { channelCounts, targetKey, targetLabel } from './targets';
import { useReportActions, useReportsData } from './use-reports';

const STATUS: Record<string, { label: string; variant: 'secondary' | 'destructive' | 'outline' }> =
  {
    sent: { label: 'Отправлен', variant: 'secondary' },
    partial: { label: 'Частично', variant: 'destructive' },
    failed: { label: 'Ошибка', variant: 'destructive' },
    pending: { label: 'В очереди', variant: 'outline' },
    waiting_data: { label: 'Ждёт данные', variant: 'outline' },
  };
const when = (iso: string) => format(parseISO(iso), 'd MMM, HH:mm', { locale: ru });
const sel =
  'h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30';

export default function ReportsPage() {
  const { workspace } = useWorkspace();
  const canManage = can(workspace.role, 'reports:manage');
  const { reports, targets: targetsQ, runs } = useReportsData();
  const actions = useReportActions();
  const [editing, setEditing] = useState<ReportDto | null | 'new'>(null);
  const [testTarget, setTestTarget] = useState('');
  const allTargets = targetsQ.data?.targets ?? [];
  const targets = allTargets.filter((t) => t.active);
  const target = targets.find((t) => targetKey(t) === testTarget) ?? targets[0];
  // Есть куда отправлять: активная группа Telegram или подключённый WhatsApp.
  const hasChannel =
    targets.some((t) => t.channel === 'telegram') || targetsQ.data?.whatsapp.status === 'connected';
  const nameOf = (d: { channel: DeliveryChannel; chatId: string; threadId: string | null }) => {
    const t = allTargets.find((x) => targetKey(x) === targetKey(d));
    return `${DELIVERY_CHANNEL_LABELS[d.channel]} · ${t ? targetLabel(t) : 'группа'}`;
  };

  return (
    // Колонка по центру, как «Интеграции» и «Настройки».
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 md:gap-6">
      <PageHeader
        title="Отчёты"
        description="Отправляются по расписанию в Telegram и WhatsApp — картинкой или PDF"
        actions={
          canManage && (
            <Button onClick={() => setEditing('new')} disabled={!hasChannel}>
              <Plus className="size-4" /> Создать отчёт
            </Button>
          )
        }
      />

      {targetsQ.data && !hasChannel && (
        <Alert>
          <AlertTriangle aria-hidden />
          <AlertDescription>
            <span>
              Чтобы отчёты уходили, подключите Telegram или WhatsApp на странице{' '}
              <Link href="/integrations" className="underline underline-offset-2">
                «Интеграции»
              </Link>
              .
            </span>
          </AlertDescription>
        </Alert>
      )}

      {reports.isPending ? (
        <LoadingState className="flex flex-col gap-3">
          {[0, 1].map((i) => (
            <Card key={i}>
              <CardHeader className="gap-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-64 max-w-full" />
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <Skeleton className="h-4 w-72 max-w-full" />
                <div className="flex flex-wrap gap-2">
                  <Skeleton className="h-7 w-20 rounded-lg" />
                  <Skeleton className="h-7 w-32 rounded-lg" />
                  <Skeleton className="h-7 w-28 rounded-lg" />
                </div>
              </CardContent>
            </Card>
          ))}
        </LoadingState>
      ) : reports.isError ? (
        <ErrorState message={reports.error.message} onRetry={() => void reports.refetch()} />
      ) : !reports.data.reports.length ? (
        <EmptyState
          title="Отчётов пока нет"
          description="Создайте «Итоги дня» — каждое утро в 09:00 за вчера."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {reports.data.reports.map((r) => (
            <Card key={r.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base">{r.name}</CardTitle>
                  <CardDescription>
                    {scheduleText(r.schedule)} · {channelCounts(r.recipients)} ·{' '}
                    {r.config.format === 'pdf' ? 'PDF' : 'картинка'}
                  </CardDescription>
                </div>
                {!r.enabled && <Badge variant="outline">выключен</Badge>}
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                <div className="text-muted-foreground">
                  {r.nextRunAt
                    ? `Следующая отправка: ${when(r.nextRunAt)}`
                    : 'Не отправляется по расписанию'}
                  {r.lastRun && (
                    <>
                      {' · последняя: '}
                      <Badge variant={STATUS[r.lastRun.status]?.variant ?? 'outline'}>
                        {STATUS[r.lastRun.status]?.label ?? r.lastRun.status}
                      </Badge>
                    </>
                  )}
                </div>
                {canManage && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setEditing(r)}>
                      Изменить
                    </Button>
                    {targets.length > 0 && (
                      <>
                        <select
                          aria-label="Куда отправить тест"
                          className={sel}
                          value={target ? targetKey(target) : ''}
                          onChange={(e) => setTestTarget(e.target.value)}
                        >
                          {DELIVERY_CHANNELS.map((ch) => {
                            const list = targets.filter((t) => t.channel === ch);
                            return list.length ? (
                              <optgroup key={ch} label={DELIVERY_CHANNEL_LABELS[ch]}>
                                {list.map((t) => (
                                  <option key={targetKey(t)} value={targetKey(t)}>
                                    {targetLabel(t)}
                                  </option>
                                ))}
                              </optgroup>
                            ) : null;
                          })}
                        </select>
                        <Button
                          size="sm"
                          disabled={actions.test.isPending || !target}
                          onClick={() =>
                            target &&
                            actions.test.mutate({
                              id: r.id,
                              to: {
                                channel: target.channel,
                                chatId: target.chatId,
                                threadId: target.threadId,
                              },
                            })
                          }
                        >
                          <Send className="size-4" />{' '}
                          {actions.test.isPending ? 'Отправляем…' : 'Отправить тест'}
                        </Button>
                      </>
                    )}
                    <ConfirmButton
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      disabled={actions.remove.isPending}
                      title={`Удалить отчёт «${r.name}»?`}
                      description="Отчёт перестанет отправляться. История отправок удалится вместе с ним."
                      confirmLabel="Удалить"
                      onConfirm={() => actions.remove.mutate(r.id)}
                    >
                      Удалить
                    </ConfirmButton>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* История — списком и свёрнута по умолчанию: открывают, когда нужно разобраться. */}
      <Card className="gap-0 py-0">
        <Collapsible>
          <CollapsibleTrigger className="group flex w-full items-center justify-between gap-3 px-4 py-4 text-left">
            <div>
              <div className="text-base font-medium">
                История отправок
                {runs.data?.runs.length ? (
                  <span className="text-muted-foreground"> · {runs.data.runs.length}</span>
                ) : null}
              </div>
              <div className="text-sm text-muted-foreground">Что именно ушло и куда доставлено</div>
            </div>
            <ChevronDown
              className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]:rotate-180"
              aria-hidden
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="border-t">
            {runs.isPending ? (
              <LoadingState className="flex flex-col divide-y">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3">
                    <Skeleton className="h-12 w-10 shrink-0 rounded" />
                    <div className="flex flex-1 flex-col gap-1.5">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                ))}
              </LoadingState>
            ) : !runs.data?.runs.length ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">Отправок ещё не было.</p>
            ) : (
              <ul className="divide-y">
                {runs.data.runs.map((run) => {
                  const rep = reports.data?.reports.find((r) => r.id === run.reportId);
                  return (
                    <li key={run.id} className="flex min-w-0 gap-3 px-4 py-3 text-sm">
                      {run.imageUrl ? (
                        <a
                          href={run.imageUrl}
                          target="_blank"
                          rel="noreferrer"
                          title="Открыть картинку целиком"
                          className="block h-12 w-10 shrink-0 overflow-hidden rounded border transition-opacity hover:opacity-90"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={run.imageUrl}
                            alt={`Картинка отчёта «${rep?.name ?? ''}»`}
                            className="size-full object-cover object-top"
                            loading="lazy"
                          />
                        </a>
                      ) : (
                        <div className="h-12 w-10 shrink-0 rounded border bg-muted" />
                      )}
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="truncate font-medium">{rep?.name ?? 'Отчёт'}</span>
                          <span className="text-xs text-muted-foreground">
                            {when(run.sentAt ?? run.scheduledFor)}
                          </span>
                          <Badge
                            variant={STATUS[run.status]?.variant ?? 'outline'}
                            className="shrink-0 sm:ml-auto"
                          >
                            {run.isTest ? 'тест · ' : ''}
                            {STATUS[run.status]?.label ?? run.status}
                          </Badge>
                        </div>
                        {run.deliveries.length > 0 && (
                          <ul className="flex flex-col gap-0.5 text-xs">
                            {run.deliveries.map((d) => (
                              <li
                                key={targetKey(d)}
                                className={cn(
                                  'break-words',
                                  d.ok ? 'text-muted-foreground' : 'text-destructive',
                                )}
                              >
                                {nameOf(d)} — {d.ok ? '✓' : d.error}
                              </li>
                            ))}
                          </ul>
                        )}
                        {run.dataNote && (
                          <p className="text-xs text-destructive">⚠ {run.dataNote}</p>
                        )}
                        {run.error && <p className="text-xs text-destructive">{run.error}</p>}
                        {run.pdfUrl && (
                          <a
                            href={run.pdfUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="w-fit text-xs text-primary underline-offset-2 hover:underline"
                          >
                            Открыть PDF
                          </a>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {editing && (
        <ReportBuilder
          key={editing === 'new' ? 'new' : editing.id}
          onClose={() => setEditing(null)}
          report={editing === 'new' ? null : editing}
          targets={allTargets}
          whatsappConnected={targetsQ.data?.whatsapp.status === 'connected'}
        />
      )}
    </div>
  );
}
