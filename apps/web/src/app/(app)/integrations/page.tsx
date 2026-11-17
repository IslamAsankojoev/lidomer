'use client';

import { can } from '@lidomer/shared';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/state';
import { useWorkspace } from '@/lib/workspace';
import { IntegrationCard } from './integration-card';
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
    <>
      <PageHeader
        className="max-w-3xl"
        title="Интеграции"
        description="Источники данных. Ключи хранятся зашифрованными и после сохранения видны только маской."
      />
      {q.isPending ? (
        <LoadingState rows={3} />
      ) : q.isError ? (
        <ErrorState message={q.error.message} onRetry={() => void q.refetch()} />
      ) : (
        // Одна колонка по порядку: Meta → Ward → Bitrix24, ширина как у документа.
        <div className="flex w-full max-w-3xl flex-col gap-4">
          {q.data.integrations.map((s) => (
            <IntegrationCard key={s.type} s={s} canManage={canManage} />
          ))}
        </div>
      )}
    </>
  );
}
