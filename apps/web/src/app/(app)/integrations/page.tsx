'use client';

import { can } from '@lidomer/shared';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/state';
import { useWorkspace } from '@/lib/workspace';
import { IntegrationCard, IntegrationCardSkeleton } from './integration-card';
import { useIntegrations } from './use-integrations';

export default function IntegrationsPage() {
  const { workspace } = useWorkspace();
  if (!can(workspace.role, 'integrations:read')) {
    return (
      <>
        <PageHeader title="Интеграции" />
        <EmptyState title="Нет доступа" description="Интеграции видят Владелец и Маркетолог." />
      </>
    );
  }
  return <IntegrationsList canManage={can(workspace.role, 'integrations:manage')} />;
}

function IntegrationsList({ canManage }: { canManage: boolean }) {
  const q = useIntegrations();
  return (
    // Одна колонка по порядку: Meta → Ward → Bitrix24, по центру и шириной как у документа.
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 md:gap-6">
      <PageHeader
        title="Интеграции"
        description="Источники данных. Ключи хранятся зашифрованными и после сохранения видны только маской."
      />
      {q.isPending ? (
        <LoadingState className="flex flex-col gap-4">
          {[0, 1, 2].map((i) => (
            <IntegrationCardSkeleton key={i} />
          ))}
        </LoadingState>
      ) : q.isError ? (
        <ErrorState message={q.error.message} onRetry={() => void q.refetch()} />
      ) : (
        <div className="flex flex-col gap-4">
          {q.data.integrations.map((s) => (
            <IntegrationCard key={s.type} s={s} canManage={canManage} />
          ))}
        </div>
      )}
    </div>
  );
}
