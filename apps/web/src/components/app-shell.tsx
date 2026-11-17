'use client';

import { can } from '@lidomer/shared';
import { Menu } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { NAV, navItemFor } from '@/components/nav';
import { ThemeToggle } from '@/components/theme-toggle';
import { UserMenu } from '@/components/user-menu';
import { WorkspaceLogo } from '@/components/workspace-logo';
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
  const items = NAV.filter((i) => !i.permission || can(workspace.role, i.permission));
  const groups = [...new Set(items.map((i) => i.group))];
  const activeHref = navItemFor(pathname)?.href;
  return (
    <nav className="flex flex-col gap-3" aria-label="Разделы">
      {groups.map((g) => (
        <div key={g} className="flex flex-col gap-0.5">
          <div className="px-2.5 pb-1 text-xs font-medium text-muted-foreground">{g}</div>
          {items
            .filter((i) => i.group === g)
            .map(({ href, label, icon: Icon }) => {
              const active = activeHref === href;
              return (
                <Link
                  key={href}
                  href={`${href}${suffix}`}
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors',
                    active
                      ? 'bg-sidebar-accent font-medium text-foreground'
                      : 'text-foreground/80 hover:bg-sidebar-accent/60 hover:text-foreground',
                  )}
                >
                  <Icon className="size-4 text-primary" aria-hidden />
                  {label}
                </Link>
              );
            })}
        </div>
      ))}
    </nav>
  );
}

/** Название компании — шапка меню. */
function Brand() {
  const { workspace } = useWorkspace();
  return (
    <div className="flex items-center gap-2 px-2.5 py-1">
      <WorkspaceLogo name={workspace.name} logoUrl={workspace.logoUrl} className="size-7" />
      <span className="truncate font-semibold">{workspace.name}</span>
    </div>
  );
}

/** Низ меню: пользователь и тема. */
function SidebarFooter() {
  return (
    <div className="mt-auto flex items-center gap-1">
      <UserMenu variant="card" />
      <ThemeToggle />
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { workspace } = useWorkspace();

  return (
    // Три слоя: серый фон страницы → полупрозрачное плавающее меню → белые карточки.
    <div className="flex min-h-dvh md:gap-2.5 md:p-2.5">
      <aside className="sticky top-2.5 hidden h-[calc(100dvh-1.25rem)] w-56 shrink-0 flex-col gap-5 rounded-2xl border border-sidebar-border bg-sidebar p-2.5 shadow-[0_1px_2px_0_rgb(0_0_0/0.04)] backdrop-blur-xl md:flex">
        <Brand />
        <NavLinks />
        <SidebarFooter />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Телефон: верхняя строка с меню. На компьютере всё это — в боковом меню. */}
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b bg-background/85 px-2 py-2 backdrop-blur md:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              render={
                <Button variant="ghost" size="icon" aria-label="Открыть меню">
                  <Menu className="size-5" />
                </Button>
              }
            />
            <SheetContent side="left" className="flex w-72 flex-col gap-5 p-3">
              <SheetTitle className="sr-only">Меню</SheetTitle>
              <Brand />
              <NavLinks onNavigate={() => setOpen(false)} />
              <SidebarFooter />
            </SheetContent>
          </Sheet>
          <WorkspaceLogo name={workspace.name} logoUrl={workspace.logoUrl} />
          <span className="truncate font-semibold">{workspace.name}</span>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <UserMenu />
          </div>
        </header>
        <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-5 px-4 py-5 md:gap-6 md:px-4 md:py-3">
          {children}
        </main>
      </div>
    </div>
  );
}
