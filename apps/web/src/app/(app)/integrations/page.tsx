'use client';

import { can } from '@lidomer/shared';
import type { ReactNode } from 'react';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/state';
import { useWorkspace } from '@/lib/workspace';
import { IntegrationCard, IntegrationCardSkeleton } from './integration-card';
import { TelegramCard } from './telegram-card';
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

/** Заголовок раздела страницы. */
function Group({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

function IntegrationsList({ canManage }: { canManage: boolean }) {
  const q = useIntegrations();
  return (
    // Одна колонка по центру и шириной как у документа: сначала источники, потом каналы отправки.
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 md:gap-8">
      <PageHeader
        title="Интеграции"
        description="Откуда кабинет берёт цифры и куда отправляет отчёты. Ключи хранятся зашифрованными и после сохранения видны только маской."
      />
      <Group title="Источники данных" description="Откуда кабинет берёт цифры. Только чтение.">
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
      </Group>
      <Group
        title="Куда отправлять отчёты"
        description="Каналы, в которые уходят отчёты по расписанию. Можно подключить оба."
      >
        <div className="flex flex-col gap-4">
          <TelegramCard />
        </div>
      </Group>
    </div>
  );
}
