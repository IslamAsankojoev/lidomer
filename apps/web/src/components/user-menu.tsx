'use client';

import { ROLE_LABELS } from '@lidomer/shared';
import { Check, ChevronsUpDown, LogOut } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useSignOut } from '@/lib/use-sign-out';
import { WorkspaceLogo } from './workspace-logo';
import { useWorkspace } from '@/lib/workspace';

/** `icon` — кружок в шапке телефона; `card` — карточка внизу бокового меню. */
export function UserMenu({ variant = 'icon' }: { variant?: 'icon' | 'card' }) {
  const { workspace, workspaces, email, select } = useWorkspace();
  const signOut = useSignOut();

  const initial = (email ?? '?').slice(0, 1).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          variant === 'card' ? (
            <button
              type="button"
              aria-label="Меню пользователя"
              className="flex min-w-0 flex-1 items-center gap-2 rounded-lg p-1.5 text-left transition-colors hover:bg-sidebar-accent/60"
            >
              <Avatar className="size-7">
                <AvatarFallback className="text-xs">{initial}</AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{email}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {ROLE_LABELS[workspace.role]}
                </span>
              </span>
              <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Меню пользователя"
              className="rounded-full"
            >
              <Avatar className="size-8">
                <AvatarFallback>{initial}</AvatarFallback>
              </Avatar>
            </Button>
          )
        }
      />
      <DropdownMenuContent align={variant === 'card' ? 'start' : 'end'} className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <div className="truncate">{email}</div>
            <div className="text-xs font-normal text-muted-foreground">
              {ROLE_LABELS[workspace.role]}
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        {workspaces.length > 1 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Переключить компанию
              </DropdownMenuLabel>
              {workspaces.map((w) => (
                <DropdownMenuItem key={w.id} onClick={() => select(w.id)}>
                  <WorkspaceLogo name={w.name} logoUrl={w.logoUrl} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{w.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {ROLE_LABELS[w.role]}
                    </span>
                  </span>
                  <Check
                    className={w.id === workspace.id ? 'size-4' : 'size-4 opacity-0'}
                    aria-label={w.id === workspace.id ? 'Выбрана' : undefined}
                  />
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void signOut()}>
          <LogOut className="size-4" />
          Выйти
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
