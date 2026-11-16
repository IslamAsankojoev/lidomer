import type { Metadata } from 'next';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/state';

export const metadata: Metadata = { title: 'Интеграции' };

export default function Page() {
  return (
    <>
      <PageHeader title="Интеграции" description="Meta Ads, Ward, Bitrix24, Telegram" />
      <EmptyState description="Подключение источников появится на этапе 2." />
    </>
  );
}
