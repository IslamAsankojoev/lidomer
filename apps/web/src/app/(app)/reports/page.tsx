'use client';

import { can, type ReportDto } from '@lidomer/shared';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { AlertTriangle, Plus, Send } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/state';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useWorkspace } from '@/lib/workspace';
import { cn } from '@/lib/utils';
import { ReportBuilder, scheduleText } from './report-builder';
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
  const { reports, chats, runs } = useReportsData();
  const actions = useReportActions();
  const [editing, setEditing] = useState<ReportDto | null | 'new'>(null);
  const [testTarget, setTestTarget] = useState('');
  const chatList = chats.data?.chats ?? [];
  const targets = chatList
    .filter((c) => c.active)
    .flatMap((c) => [
      { key: `${c.id}|`, label: c.title, chatId: c.id, threadId: null as string | null },
      ...c.topics.map((t) => ({
        key: `${c.id}|${t.id}`,
        label: `${c.title} › ${t.name}`,
        chatId: c.id,
        threadId: t.id,
      })),
    ]);
  const target = targets.find((t) => t.key === testTarget) ?? targets[0];

  return (
    // Колонка по центру, как «Интеграции» и «Настройки».
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 md:gap-6">
      <PageHeader
        title="Отчёты"
        description="Отправляются по расписанию в Telegram и WhatsApp — картинкой или PDF"
        actions={
          canManage && (
            <Button onClick={() => setEditing('new')} disabled={!chats.data?.configured}>
              <Plus className="size-4" /> Создать отчёт
            </Button>
          )
        }
      />

      {chats.data && !targets.length && (
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
                    {scheduleText(r.schedule)} · получателей {r.recipients.length} ·{' '}
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
                          value={target?.key}
                          onChange={(e) => setTestTarget(e.target.value)}
                        >
                          {targets.map((t) => (
                            <option key={t.key} value={t.key}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                        <Button
                          size="sm"
                          disabled={actions.test.isPending || !target}
                          onClick={() =>
                            target &&
                            actions.test.mutate({
                              id: r.id,
                              chatId: target.chatId,
                              threadId: target.threadId,
                            })
                          }
                        >
                          <Send className="size-4" />{' '}
                          {actions.test.isPending ? 'Отправляем…' : 'Отправить тест'}
                        </Button>
                      </>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() =>
                        confirm(
                          `Удалить отчёт «${r.name}»? История отправок удалится вместе с ним.`,
                        ) && actions.remove.mutate(r.id)
                      }
                    >
                      Удалить
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">История отправок</CardTitle>
          <CardDescription>Что именно ушло: картинка и подпись</CardDescription>
        </CardHeader>
        <CardContent>
          {runs.isPending ? (
            // Миниатюры отправок: название, дата со статусом и картинка 4:5.
            <LoadingState className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className={cn(
                    'flex flex-col gap-2 rounded-lg border p-2.5',
                    i === 2 && 'hidden md:flex',
                  )}
                >
                  <Skeleton className="h-4 w-2/3" />
                  <div className="flex items-center justify-between gap-1.5">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                  <Skeleton className="aspect-[4/5] w-full" />
                </div>
              ))}
            </LoadingState>
          ) : !runs.data?.runs.length ? (
            <p className="text-sm text-muted-foreground">Отправок ещё не было.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {runs.data.runs.map((run) => {
                const rep = reports.data?.reports.find((r) => r.id === run.reportId);
                return (
                  <li
                    key={run.id}
                    className="flex min-w-0 flex-col gap-2 rounded-lg border p-2.5 text-sm"
                  >
                    {/* Название, затем дата и статус одной строкой — миниатюры стоят на одной высоте. */}
                    <div className="truncate font-medium">{rep?.name ?? 'Отчёт'}</div>
                    <div className="flex items-center justify-between gap-1.5 text-xs text-muted-foreground">
                      <span className="truncate">{when(run.sentAt ?? run.scheduledFor)}</span>
                      <Badge
                        variant={STATUS[run.status]?.variant ?? 'outline'}
                        className="shrink-0"
                      >
                        {run.isTest ? 'тест · ' : ''}
                        {STATUS[run.status]?.label ?? run.status}
                      </Badge>
                    </div>
                    {run.imageUrl && (
                      <a
                        href={run.imageUrl}
                        target="_blank"
                        rel="noreferrer"
                        title="Открыть картинку целиком"
                        className="block overflow-hidden rounded-md border transition-opacity hover:opacity-90"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={run.imageUrl}
                          alt={`Картинка отчёта «${rep?.name ?? ''}»`}
                          className="aspect-[4/5] w-full object-cover object-top"
                          loading="lazy"
                        />
                      </a>
                    )}
                    {run.pdfUrl && (
                      <a
                        href={run.pdfUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-primary underline-offset-2 hover:underline"
                      >
                        Открыть PDF
                      </a>
                    )}
                    {run.dataNote && <p className="text-xs text-destructive">⚠ {run.dataNote}</p>}
                    {run.error && <p className="text-xs text-destructive">{run.error}</p>}
                    {run.deliveries.some((d) => !d.ok) && (
                      <p className="text-xs text-destructive">
                        {run.deliveries
                          .filter((d) => !d.ok)
                          .map((d) => d.error)
                          .join('; ')}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {editing && (
        <ReportBuilder
          key={editing === 'new' ? 'new' : editing.id}
          onClose={() => setEditing(null)}
          report={editing === 'new' ? null : editing}
          chats={chatList}
        />
      )}
    </div>
  );
}
