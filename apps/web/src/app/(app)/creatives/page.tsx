import type { Metadata } from 'next';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/state';

export const metadata: Metadata = { title: 'Креативы' };

export default function Page() {
  return (
    <>
      <PageHeader title="Креативы" description="Расход, заявки и продажи по каждому объявлению" />
      <EmptyState description="Таблица креативов появится, когда подключим Meta Ads и Ward (этап 2)." />
    </>
  );
}
