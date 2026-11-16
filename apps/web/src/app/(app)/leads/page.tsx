import type { Metadata } from 'next';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/state';

export const metadata: Metadata = { title: 'Лиды' };

export default function Page() {
  return (
    <>
      <PageHeader title="Лиды" description="Единый журнал лидов: объявление → Ward → сделка" />
      <EmptyState description="Журнал лидов появится после синхронизации Ward и Bitrix24 и сверки (этапы 2–3)." />
    </>
  );
}
