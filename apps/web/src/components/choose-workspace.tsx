'use client';

import { ROLE_LABELS, type WorkspaceSummary } from '@lidomer/shared';
import { ChevronRight, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useSignOut } from '@/lib/use-sign-out';
import { WorkspaceLogo } from './workspace-logo';

/** После входа: участник нескольких компаний выбирает, в какую войти. Сменить — в меню пользователя. */
export function ChooseWorkspace({
  workspaces,
  onSelect,
}: {
  workspaces: WorkspaceSummary[];
  onSelect: (id: string) => void;
}) {
  const signOut = useSignOut();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Выберите компанию</CardTitle>
        <CardDescription>
          Вы в команде нескольких компаний. Переключиться потом можно в меню пользователя.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ul className="divide-y rounded-lg border">
          {workspaces.map((w) => (
            <li key={w.id}>
              <button
                type="button"
                onClick={() => onSelect(w.id)}
                className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
              >
                <WorkspaceLogo name={w.name} logoUrl={w.logoUrl} className="size-8" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{w.name}</span>
                  <span className="block text-xs text-muted-foreground">{ROLE_LABELS[w.role]}</span>
                </span>
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
        <Button variant="ghost" onClick={() => void signOut()}>
          <LogOut className="size-4" aria-hidden /> Выйти
        </Button>
      </CardContent>
    </Card>
  );
}
