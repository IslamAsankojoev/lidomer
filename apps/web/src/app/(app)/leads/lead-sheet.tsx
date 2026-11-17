'use client';

import {
  can,
  DEAL_STATUS_LABELS,
  DEAL_STATUSES,
  LEAD_CHANNEL_LABELS,
  LEAD_CHANNELS,
  LEAD_FLAG_LABELS,
  leadDetailResponseSchema,
} from '@lidomer/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { ErrorState, LoadingState } from '@/components/state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useApi } from '@/lib/api';
import { money } from '@/lib/format';
import { useWorkspace } from '@/lib/workspace';
import { SourceBadge, SourceLogo } from '@/components/source-badge';

const FACT_LABELS: Record<string, string> = {
  type: 'Тип',
  district: 'Район',
  complex: 'ЖК',
  rooms: 'Комнаты',
  budget: 'Бюджет',
  downPayment: 'Первый взнос',
  payment: 'Оплата',
  barter: 'Бартер',
  purpose: 'Цель',
  timing: 'Сроки',
  interest: 'Интерес',
  callTime: 'Когда звонить',
  note: 'Заметка',
  name: 'Имя',
};

const selectCls =
  'h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30';

/** Карточка лида: хронология «объявление → Ward → сделка», анкета, ручная правка. */
export function LeadSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const api = useApi();
  const { workspace } = useWorkspace();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['lead', workspace.id, id],
    queryFn: () =>
      api(leadDetailResponseSchema, `/leads/${encodeURIComponent(id!)}`, {
        workspaceId: workspace.id,
      }),
    enabled: !!id,
  });
  const [field, setField] = useState<'channel' | 'status' | 'excluded'>('channel');
  const [value, setValue] = useState<string>('organic');
  const [reason, setReason] = useState('');

  const override = useMutation({
    mutationFn: () =>
      api(z.null(), `/leads/${encodeURIComponent(id!)}/overrides`, {
        workspaceId: workspace.id,
        method: 'POST',
        body: { field, value: field === 'excluded' ? true : value, reason },
      }),
    onSuccess: async () => {
      toast.success('Правка сохранена, цифры пересчитаны');
      setReason('');
      await qc.invalidateQueries();
      if (field === 'excluded') onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const l = q.data?.item;
  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{l?.name ?? (l?.instagram ? `@${l.instagram}` : 'Лид')}</SheetTitle>
          <SheetDescription className="flex items-center gap-2">
            {l ? (
              <>
                {LEAD_CHANNEL_LABELS[l.channel]}
                <SourceBadge source={l.origin === 'ward' ? 'ward' : 'bitrix24'} variant="pill" />
              </>
            ) : (
              ' '
            )}
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-5 px-4 pb-6">
          {q.isPending ? (
            <LoadingState rows={3} />
          ) : q.isError || !l ? (
            <ErrorState message={q.error?.message} onRetry={() => void q.refetch()} />
          ) : (
            <>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="text-muted-foreground">Телефон</dt>
                <dd>{l.phone ?? '—'}</dd>
                <dt className="text-muted-foreground">Instagram</dt>
                <dd>{l.instagram ? `@${l.instagram}` : '—'}</dd>
                <dt className="text-muted-foreground">Статус</dt>
                <dd>
                  {DEAL_STATUS_LABELS[l.status]}
                  {l.stageName && ` · ${l.stageName}`}
                  {l.amountMinor !== null && ` · ${money(l.amountMinor, l.currency)}`}
                </dd>
                {l.isRepeat && (
                  <>
                    <dt className="text-muted-foreground">Повтор</dt>
                    <dd>первое обращение — {l.repeatOf}</dd>
                  </>
                )}
              </dl>
              {l.flags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {l.flags.map((f) => (
                    <Badge key={f} variant={f === 'no_deal' ? 'destructive' : 'secondary'}>
                      {LEAD_FLAG_LABELS[f]}
                    </Badge>
                  ))}
                </div>
              )}

              <section>
                <h3 className="mb-2 text-sm font-medium">Хронология</h3>
                <ol className="relative flex flex-col gap-3 border-l pl-4">
                  {q.data.timeline.map((e, i) => (
                    <li key={i} className="relative">
                      <span
                        className="absolute top-1.5 -left-[21px] size-2.5 rounded-full bg-[var(--chart-1)]"
                        aria-hidden
                      />
                      <div className="text-xs text-muted-foreground">
                        {format(parseISO(e.at), 'd MMM yyyy, HH:mm', { locale: ru })}
                      </div>
                      <div className="text-sm font-medium">{e.title}</div>
                      {e.details && (
                        <div className="text-sm text-muted-foreground">{e.details}</div>
                      )}
                    </li>
                  ))}
                </ol>
              </section>

              {q.data.facts && Object.keys(q.data.facts).length > 0 && (
                <section>
                  <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium">
                    <SourceLogo source="ward" />
                    Анкета WARD
                  </h3>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                    {Object.entries(q.data.facts).map(([k, v]) => (
                      <div key={k} className="contents">
                        <dt className="text-muted-foreground">{FACT_LABELS[k] ?? k}</dt>
                        <dd>{String(v)}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              )}

              {can(workspace.role, 'leads:override') && (
                <section className="flex flex-col gap-2 rounded-lg border p-3">
                  <h3 className="text-sm font-medium">Ручная правка</h3>
                  <p className="text-xs text-muted-foreground">
                    Данные источников не меняются: правка хранится отдельно с вашим именем и
                    причиной.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <select
                      aria-label="Что поправить"
                      className={selectCls}
                      value={field}
                      onChange={(e) => {
                        const f = e.target.value as typeof field;
                        setField(f);
                        setValue(f === 'status' ? 'won' : 'organic');
                      }}
                    >
                      <option value="channel">Канал</option>
                      <option value="status">Статус</option>
                      <option value="excluded">Не считать лидом</option>
                    </select>
                    {field !== 'excluded' && (
                      <select
                        aria-label="Новое значение"
                        className={selectCls}
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                      >
                        {(field === 'channel' ? LEAD_CHANNELS : DEAL_STATUSES).map((v) => (
                          <option key={v} value={v}>
                            {field === 'channel'
                              ? LEAD_CHANNEL_LABELS[v as (typeof LEAD_CHANNELS)[number]]
                              : DEAL_STATUS_LABELS[v as (typeof DEAL_STATUSES)[number]]}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <Input
                    placeholder="Причина (обязательно)"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <Button
                    size="sm"
                    disabled={reason.trim().length < 3 || override.isPending}
                    onClick={() => override.mutate()}
                  >
                    Сохранить правку
                  </Button>
                  {q.data.overrides.length > 0 && (
                    <ul className="text-xs text-muted-foreground">
                      {q.data.overrides.map((o) => (
                        <li key={o.id}>
                          {format(parseISO(o.createdAt), 'd MMM, HH:mm', { locale: ru })} ·{' '}
                          {o.field} → {JSON.stringify(o.value)} · {o.reason}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
