'use client';

import { ROLE_LABELS } from '@lidomer/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Check, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
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
import { supabaseBrowser } from '@/lib/supabase/client';
import { useWorkspace } from '@/lib/workspace';

export function UserMenu() {
  const { workspace, workspaces, email, select } = useWorkspace();
  const router = useRouter();
  const queryClient = useQueryClient();

  const signOut = async () => {
    await supabaseBrowser().auth.signOut();
    queryClient.clear();
    router.replace('/login');
    router.refresh();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label="Меню пользователя"
            className="rounded-full"
          >
            <Avatar className="size-8">
              <AvatarFallback>{(email ?? '?').slice(0, 1).toUpperCase()}</AvatarFallback>
            </Avatar>
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-64">
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
                Компания
              </DropdownMenuLabel>
              {workspaces.map((w) => (
                <DropdownMenuItem key={w.id} onClick={() => select(w.id)}>
                  <Check className={w.id === workspace.id ? 'size-4' : 'size-4 opacity-0'} />
                  {w.name}
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
