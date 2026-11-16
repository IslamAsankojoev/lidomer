'use client';

import { can } from '@lidomer/shared';
import { Menu } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { NAV } from '@/components/nav';
import { PeriodBar } from '@/components/period-bar';
import { ThemeToggle } from '@/components/theme-toggle';
import { UserMenu } from '@/components/user-menu';
import { useWorkspace } from '@/lib/workspace';

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { workspace } = useWorkspace();
  // Период переносится между разделами, остальные фильтры — нет.
  const params = useSearchParams();
  const period = new URLSearchParams();
  for (const k of ['period', 'from', 'to']) {
    const v = params.get(k);
    if (v) period.set(k, v);
  }
  const suffix = period.size ? `?${period.toString()}` : '';
  return (
    <nav className="flex flex-col gap-1" aria-label="Разделы">
      {NAV.filter((i) => !i.permission || can(workspace.role, i.permission)).map(
        ({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={`${href}${suffix}`}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-accent font-medium text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
              )}
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </Link>
          );
        },
      )}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { workspace } = useWorkspace();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-6 border-r bg-sidebar p-4 md:flex">
        <div className="px-3 font-semibold">{workspace.name}</div>
        <NavLinks />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex flex-col gap-2 border-b bg-background/90 px-4 py-3 backdrop-blur md:px-6">
          <div className="flex items-center gap-2">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="md:hidden"
                    aria-label="Открыть меню"
                  >
                    <Menu className="size-5" />
                  </Button>
                }
              />
              <SheetContent side="left" className="w-72 p-4">
                <SheetTitle className="px-3">{workspace.name}</SheetTitle>
                <NavLinks onNavigate={() => setOpen(false)} />
              </SheetContent>
            </Sheet>
            <span className="truncate font-semibold md:hidden">{workspace.name}</span>
            <div className="ml-auto flex items-center gap-1">
              <ThemeToggle />
              <UserMenu />
            </div>
          </div>
          <PeriodBar />
        </header>
        <main className="flex flex-1 flex-col gap-6 px-4 py-6 md:px-6">{children}</main>
      </div>
    </div>
  );
}
