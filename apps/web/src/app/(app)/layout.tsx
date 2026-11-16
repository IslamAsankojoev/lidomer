'use client';

import { Suspense, type ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { EmptyState, ErrorState, LoadingState } from '@/components/state';
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
      loading={
        <Centered>
          <LoadingState />
        </Centered>
      }
      error={(retry, message) => (
        <Centered>
          <ErrorState message={message} onRetry={retry} />
        </Centered>
      )}
      empty={
        <Centered>
          <EmptyState
            title="Вы пока не участник ни одной компании"
            description="Попросите владельца пригласить вас по email."
          />
        </Centered>
      }
    >
      <Suspense>
        <AppShell>{children}</AppShell>
      </Suspense>
    </WorkspaceProvider>
  );
}
