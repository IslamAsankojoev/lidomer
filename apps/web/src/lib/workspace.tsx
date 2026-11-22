'use client';

import { meResponseSchema, type WorkspaceSummary } from '@lidomer/shared';
import { useQuery } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useApi } from '@/lib/api';

const STORAGE_KEY = 'lidomer.workspace';

interface WorkspaceState {
  workspace: WorkspaceSummary;
  workspaces: WorkspaceSummary[];
  email: string | null;
  select: (id: string) => void;
}

const WorkspaceContext = createContext<WorkspaceState | null>(null);

/** Запомнить выбранную компанию (в том числе только что созданную — до загрузки /me). */
export function selectWorkspace(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* выбор просто не запомнится */
  }
}

/** Забыть выбор: после следующего входа участник нескольких компаний выберет заново. */
export function clearWorkspaceSelection(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* нечего забывать */
  }
}

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Загружает /me и держит выбранную компанию. Пока не загружено — `loading`; компаний нет —
 * `empty`; компаний несколько и ни одна не выбрана (после входа) — `choose`.
 */
export function WorkspaceProvider({
  children,
  loading,
  error,
  empty,
  choose,
}: {
  children: ReactNode;
  loading: ReactNode;
  error: (retry: () => void, message: string) => ReactNode;
  empty: ReactNode;
  choose: (workspaces: WorkspaceSummary[], select: (id: string) => void) => ReactNode;
}) {
  const api = useApi();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api(meResponseSchema, '/me') });
  // До загрузки /me разметка не зависит от выбора, поэтому читать localStorage сразу безопасно.
  const [selectedId, setSelectedId] = useState<string | null>(readStored);

  const select = useCallback((id: string) => {
    setSelectedId(id);
    selectWorkspace(id);
  }, []);
  const list = useMemo(() => me.data?.workspaces ?? [], [me.data]);
  const value = useMemo<WorkspaceState | null>(() => {
    // Одна компания — сразу она; несколько — только явно выбранная.
    const workspace =
      list.find((w) => w.id === selectedId) ?? (list.length === 1 ? list[0] : undefined);
    if (!me.data || !workspace) return null;
    return { workspace, workspaces: list, email: me.data.user.email, select };
  }, [me.data, list, selectedId, select]);

  if (me.isPending) return loading;
  if (me.isError) return error(() => void me.refetch(), me.error.message);
  if (!list.length) return empty;
  if (!value) return choose(list, select);
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceState {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace вне WorkspaceProvider');
  return ctx;
}
