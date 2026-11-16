'use client';

import { meResponseSchema, type WorkspaceSummary } from '@lidomer/shared';
import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useApi } from '@/lib/api';

const STORAGE_KEY = 'lidomer.workspace';

interface WorkspaceState {
  workspace: WorkspaceSummary;
  workspaces: WorkspaceSummary[];
  email: string | null;
  select: (id: string) => void;
}

const WorkspaceContext = createContext<WorkspaceState | null>(null);

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Загружает /me и держит выбранную компанию. Пока не загружено — показывает `fallback`. */
export function WorkspaceProvider({
  children,
  loading,
  error,
  empty,
}: {
  children: ReactNode;
  loading: ReactNode;
  error: (retry: () => void, message: string) => ReactNode;
  empty: ReactNode;
}) {
  const api = useApi();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api(meResponseSchema, '/me') });
  // До загрузки /me разметка не зависит от выбора, поэтому читать localStorage сразу безопасно.
  const [selectedId, setSelectedId] = useState<string | null>(readStored);

  const value = useMemo<WorkspaceState | null>(() => {
    const list = me.data?.workspaces ?? [];
    const workspace = list.find((w) => w.id === selectedId) ?? list[0];
    if (!me.data || !workspace) return null;
    return {
      workspace,
      workspaces: list,
      email: me.data.user.email,
      select: (id) => {
        setSelectedId(id);
        try {
          localStorage.setItem(STORAGE_KEY, id);
        } catch {
          /* выбор просто не запомнится */
        }
      },
    };
  }, [me.data, selectedId]);

  if (me.isPending) return loading;
  if (me.isError) return error(() => void me.refetch(), me.error.message);
  if (!value) return empty;
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceState {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace вне WorkspaceProvider');
  return ctx;
}
