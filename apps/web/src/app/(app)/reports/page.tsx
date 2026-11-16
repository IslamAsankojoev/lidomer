import type { Metadata } from 'next';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/state';

export const metadata: Metadata = { title: 'Отчёты' };

export default function Page() {
  return (
    <>
      <PageHeader title="Отчёты" description="Отчёты в Telegram по расписанию" />
      <EmptyState description="Конструктор отчётов появится на этапе 5." />
    </>
  );
}
