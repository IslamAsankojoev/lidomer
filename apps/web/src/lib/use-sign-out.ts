'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
import { clearWorkspaceSelection } from '@/lib/workspace';

/** Выйти: сессия Supabase, кэш запросов — и на страницу входа. */
export function useSignOut() {
  const router = useRouter();
  const queryClient = useQueryClient();
  return async () => {
    await supabaseBrowser().auth.signOut();
    // Следующий вход — с выбора компании, если их несколько.
    clearWorkspaceSelection();
    queryClient.clear();
    router.replace('/login');
    router.refresh();
  };
}
