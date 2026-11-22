'use client';

import { can } from '@lidomer/shared';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import { SourceLogo } from '@/components/source-badge';
import { ErrorState } from '@/components/state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useWorkspace } from '@/lib/workspace';
import { ApiBadge, HowItWorks, IntegrationCardSkeleton } from './integration-card';
import { INTEGRATION_INFO } from './integration-info';
import { useTelegramActions, useTelegramChats } from './use-telegram';

const sel =
  'h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30';
const info = INTEGRATION_INFO.telegram;

/** Telegram: бот сервиса, привязка групп кодом, группа алертов. */
export function TelegramCard() {
  const { workspace } = useWorkspace();
  const q = useTelegramChats();
  const actions = useTelegramActions();
  if (q.isPending) return <IntegrationCardSkeleton />;
  if (q.isError) return <ErrorState message={q.error.message} onRetry={() => void q.refetch()} />;
  const d = q.data;
  const active = d.chats.filter((c) => c.active);
  const status = !d.configured
    ? { label: 'Не настроен', variant: 'outline' as const }
    : active.length
      ? { label: `Подключено · групп ${active.length}`, variant: 'success' as const }
      : { label: 'Нет групп', variant: 'outline' as const };

  return (
    <Card className="gap-0 pb-0">
      <CardHeader className="flex flex-row items-start gap-3 pb-4">
        <SourceLogo source="telegram" className="size-9" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <CardTitle>Telegram</CardTitle>
            <Badge variant={status.variant} className="shrink-0">
              {status.label}
            </Badge>
            <ApiBadge info={info} />
          </div>
          <CardDescription>{info.summary}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pb-4 text-sm">
        {!d.configured ? (
          <p className="text-muted-foreground">
            Бот не настроен: владелец вносит <code>TELEGRAM_BOT_TOKEN</code> в Vercel (проект api) —
            см. docs/setup/etap-5.md.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              Команда для группы:
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono"
                onClick={() => {
                  void navigator.clipboard.writeText(`/connect ${d.connectCode}`);
                  toast.success('Команда скопирована');
                }}
              >
                /connect {d.connectCode} <Copy className="size-3" aria-hidden />
              </button>
              {d.botUsername && (
                <span className="text-muted-foreground">· бот @{d.botUsername}</span>
              )}
            </div>
            {d.chats.length ? (
              <ul className="divide-y rounded-lg border">
                {d.chats.map((c) => (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                  >
                    <span className="min-w-0">
                      {c.title}
                      {c.topics.length > 0 && (
                        <span className="text-muted-foreground">
                          {' '}
                          · темы: {c.topics.map((t) => t.name).join(', ')}
                        </span>
                      )}
                    </span>
                    {!c.active && <Badge variant="destructive">бот удалён</Badge>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">Пока ни одной группы.</p>
            )}
            {can(workspace.role, 'reports:manage') && d.chats.length > 0 && (
              <label className="flex flex-wrap items-center gap-2">
                Алерты о сбоях интеграций —
                <select
                  className={sel}
                  value={d.alertChatId ?? ''}
                  disabled={actions.alertChat.isPending}
                  onChange={(e) => actions.alertChat.mutate(e.target.value || null)}
                >
                  <option value="">не отправлять</option>
                  {d.chats.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {/* api проверяет setup по settings:manage — маркетологу кнопку не показываем. */}
            {can(workspace.role, 'settings:manage') && (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => actions.setup.mutate()}
                  disabled={actions.setup.isPending}
                >
                  {actions.setup.isPending ? 'Подключаем…' : 'Подключить бота к кабинету'}
                </Button>
                <span className="text-xs text-muted-foreground">
                  Один раз после внесения токена или его смены — чтобы бот слышал команду /connect.
                </span>
              </div>
            )}
          </>
        )}
      </CardContent>
      <HowItWorks info={info} defaultOpen={!active.length} bot={d.botUsername ?? undefined} />
    </Card>
  );
}
