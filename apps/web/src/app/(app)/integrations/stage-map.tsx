'use client';

import {
  type B24Stage,
  b24StagesResponseSchema,
  DEAL_STATUS_LABELS,
  DEAL_STATUSES,
  type DealStatus,
  defaultDealStatus,
} from '@lidomer/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ErrorState, LoadingState } from '@/components/state';
import { Button } from '@/components/ui/button';
import { useApi } from '@/lib/api';
import { useWorkspace } from '@/lib/workspace';

const SEMANTICS_HINT: Record<B24Stage['semantics'], string> = {
  process: 'в Bitrix24 — в работе',
  success: 'в Bitrix24 — успех',
  failure: 'в Bitrix24 — провал',
};

/**
 * Сопоставление стадий сделок Bitrix24 со статусами «В работе / Продажа / Отказ».
 * По умолчанию — по семантике Bitrix24; владелец может поправить.
 */
export function StageMap({ canManage }: { canManage: boolean }) {
  const api = useApi();
  const { workspace } = useWorkspace();
  const qc = useQueryClient();
  const key = ['b24-stages', workspace.id];
  const opts = { workspaceId: workspace.id };
  const q = useQuery({
    queryKey: key,
    queryFn: () => api(b24StagesResponseSchema, '/integrations/bitrix24/stages', opts),
  });
  const [draft, setDraft] = useState<Record<string, DealStatus>>({});

  const save = useMutation({
    mutationFn: (stages: B24Stage[]) =>
      api(b24StagesResponseSchema, '/integrations/bitrix24/stages', {
        ...opts,
        method: 'PUT',
        body: {
          mappings: Object.entries(draft).map(([stageId, status]) => {
            const st = stages.find((s) => s.stageId === stageId);
            // Совпадает с умолчанием — храним null, чтобы следовать за Bitrix24.
            return {
              stageId,
              status: st && defaultDealStatus(st.semantics) === status ? null : status,
            };
          }),
        },
      }),
    onSuccess: (res) => {
      qc.setQueryData(key, res);
      setDraft({});
      toast.success('Статусы сохранены');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const groups = useMemo(() => {
    const m = new Map<number, { name: string; stages: B24Stage[] }>();
    for (const s of q.data?.stages ?? []) {
      const g = m.get(s.categoryId) ?? {
        name:
          s.categoryName ?? (s.categoryId === 0 ? 'Общая воронка' : `Направление ${s.categoryId}`),
        stages: [],
      };
      g.stages.push(s);
      m.set(s.categoryId, g);
    }
    return [...m.values()];
  }, [q.data]);

  if (q.isPending) return <LoadingState rows={2} />;
  if (q.isError) return <ErrorState message={q.error.message} onRetry={() => void q.refetch()} />;
  if (!q.data.stages.length)
    return (
      <p className="text-sm text-muted-foreground">
        Стадии ещё не загружены — появятся после синхронизации.
      </p>
    );

  const dirty = Object.keys(draft).length > 0;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Как считать сделку на каждой стадии. По умолчанию — как в Bitrix24: успех → «Продажа»,
        провал → «Отказ», остальное → «В работе».
      </p>
      {groups.map((g) => (
        <div key={g.name} className="flex flex-col gap-1">
          <div className="text-sm font-medium">{g.name}</div>
          <ul className="divide-y rounded-lg border">
            {g.stages.map((s) => {
              const value = draft[s.stageId] ?? s.status;
              return (
                <li
                  key={s.stageId}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm">{s.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {s.deals} сделок · {SEMANTICS_HINT[s.semantics]}
                      {s.mappedStatus && ' · изменено вручную'}
                    </div>
                  </div>
                  <select
                    aria-label={`Статус для стадии «${s.name}»`}
                    disabled={!canManage || save.isPending}
                    value={value}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, [s.stageId]: e.target.value as DealStatus }))
                    }
                    className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 dark:bg-input/30"
                  >
                    {DEAL_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {DEAL_STATUS_LABELS[st]}
                      </option>
                    ))}
                  </select>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {canManage && (
        <div className="flex gap-2">
          <Button disabled={!dirty || save.isPending} onClick={() => save.mutate(q.data.stages)}>
            {save.isPending ? 'Сохраняем…' : 'Сохранить'}
          </Button>
          {dirty && (
            <Button variant="ghost" onClick={() => setDraft({})}>
              Отменить
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
