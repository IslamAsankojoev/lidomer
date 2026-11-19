'use client';

import { can, type CountingSettings, countingResponseSchema } from '@lidomer/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { ListSkeleton, TextSkeleton } from '@/components/skeletons';
import { ErrorState, LoadingState } from '@/components/state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useApi } from '@/lib/api';
import { int } from '@/lib/format';
import { useWorkspace } from '@/lib/workspace';
import { SourceLogo } from '@/components/source-badge';

type Kind = 'auto' | 'ad' | 'excluded';

/** Правила подсчёта: окно повторов и роль каждого источника сделок Bitrix24. */
export function CountingCard() {
  const api = useApi();
  const { workspace } = useWorkspace();
  const qc = useQueryClient();
  const canEdit = can(workspace.role, 'settings:manage');
  const key = ['counting', workspace.id];
  const q = useQuery({
    queryKey: key,
    queryFn: () => api(countingResponseSchema, '/settings/counting', { workspaceId: workspace.id }),
  });
  const [draft, setDraft] = useState<CountingSettings | null>(null);
  const settings = draft ?? q.data?.settings;

  const save = useMutation({
    mutationFn: (body: CountingSettings) =>
      api(countingResponseSchema, '/settings/counting', {
        workspaceId: workspace.id,
        method: 'PUT',
        body,
      }),
    onSuccess: async (res) => {
      qc.setQueryData(key, res);
      setDraft(null);
      toast.success('Правила сохранены, цифры пересчитаны');
      await qc.invalidateQueries({ queryKey: ['summary'] });
      await qc.invalidateQueries({ queryKey: ['leads'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const kindOf = (id: string): Kind =>
    settings?.adSourceIds.includes(id)
      ? 'ad'
      : settings?.excludedSourceIds.includes(id)
        ? 'excluded'
        : 'auto';
  const setKind = (id: string, kind: Kind) => {
    if (!settings) return;
    const without = (list: string[]) => list.filter((x) => x !== id);
    setDraft({
      ...settings,
      adSourceIds:
        kind === 'ad' ? [...without(settings.adSourceIds), id] : without(settings.adSourceIds),
      excludedSourceIds:
        kind === 'excluded'
          ? [...without(settings.excludedSourceIds), id]
          : without(settings.excludedSourceIds),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Правила подсчёта</CardTitle>
        <CardDescription>
          Как считать лидов. После сохранения все цифры пересчитываются; данные источников не
          меняются.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {q.isPending || !settings ? (
          q.isError ? (
            <ErrorState message={q.error.message} onRetry={() => void q.refetch()} />
          ) : (
            // Поле срока повторов и список источников с выбором справа.
            <LoadingState className="flex flex-col gap-5">
              <div className="flex flex-wrap items-center gap-2">
                <Skeleton className="h-4 w-72 max-w-full" />
                <Skeleton className="h-8 w-20 rounded-lg" />
              </div>
              <div className="flex flex-col gap-2">
                <Skeleton className="h-4 w-52" />
                <TextSkeleton lines={2} />
                <ListSkeleton rows={3} trailing="control" inset className="rounded-lg border" />
              </div>
            </LoadingState>
          )
        ) : (
          <>
            <label className="flex flex-wrap items-center gap-2 text-sm">
              Повторное обращение — тот же Instagram или телефон в течение
              <Input
                type="number"
                min={0}
                max={365}
                className="h-8 w-20"
                disabled={!canEdit}
                value={settings.duplicateWindowDays}
                onChange={(e) =>
                  setDraft({ ...settings, duplicateWindowDays: Number(e.target.value) || 0 })
                }
              />
              дней
            </label>

            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-1.5 text-sm font-medium">
                <SourceLogo source="bitrix24" />
                Источники сделок Bitrix24
              </div>
              <p className="text-xs text-muted-foreground">
                «Авто»: реклама, если у сделки рекламные UTM (ig/fb), иначе — другой канал.
                «Реклама» — всегда лиды с рекламы. «Не считать» — например, импорт старой базы.
              </p>
              <ul className="divide-y rounded-lg border">
                {(q.data?.bitrixSources ?? []).map((s) => (
                  <li
                    key={s.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm">{s.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {int(s.deals30d)} сделок за 30 дней
                        {s.withUtm30d > 0 && ` · с UTM ${int(s.withUtm30d)}`}
                      </div>
                    </div>
                    <select
                      aria-label={`Как считать источник «${s.name}»`}
                      disabled={!canEdit || save.isPending}
                      value={kindOf(s.id)}
                      onChange={(e) => setKind(s.id, e.target.value as Kind)}
                      className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 dark:bg-input/30"
                    >
                      <option value="auto">Авто (по UTM)</option>
                      <option value="ad">Реклама</option>
                      <option value="excluded">Не считать</option>
                    </select>
                  </li>
                ))}
              </ul>
            </div>

            {canEdit && (
              <div className="flex gap-2">
                <Button
                  disabled={!draft || save.isPending}
                  onClick={() => draft && save.mutate(draft)}
                >
                  {save.isPending ? 'Пересчитываем…' : 'Сохранить'}
                </Button>
                {draft && (
                  <Button variant="ghost" onClick={() => setDraft(null)}>
                    Отменить
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
