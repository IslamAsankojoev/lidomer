'use client';

import { Suspense, type ReactNode } from 'react';
import { AppShell, AppShellSkeleton } from '@/components/app-shell';
import { ChooseWorkspace } from '@/components/choose-workspace';
import { CreateWorkspace } from '@/components/create-workspace';
import { ErrorState } from '@/components/state';
import { WorkspaceProvider } from '@/lib/workspace';

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center p-4">
      {children}
    </div>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <WorkspaceProvider
      loading={<AppShellSkeleton />}
      error={(retry, message) => (
        <Centered>
          <ErrorState message={message} onRetry={retry} />
        </Centered>
      )}
      choose={(workspaces, select) => (
        <Centered>
          <ChooseWorkspace workspaces={workspaces} onSelect={select} />
        </Centered>
      )}
      empty={
        <Centered>
          <CreateWorkspace />
        </Centered>
      }
    >
      <Suspense>
        <AppShell>{children}</AppShell>
      </Suspense>
    </WorkspaceProvider>
  );
}
