'use client';

import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/state';
import { usePeriod } from '@/lib/period';
import { useWorkspace } from '@/lib/workspace';

export default function OverviewPage() {
  const { workspace } = useWorkspace();
  const { range } = usePeriod();
  return (
    <>
      <PageHeader
        title="Обзор"
        description={`${workspace.name} · дни по поясу ${workspace.timezone}`}
      />
      <EmptyState
        title="Нет данных за период"
        description={`Источники ещё не подключены, поэтому за ${range.from} — ${range.to} цифр нет. Мы не показываем нули вместо отсутствующих данных.`}
      />
    </>
  );
}
