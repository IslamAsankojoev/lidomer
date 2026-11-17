'use client';

import { can } from '@lidomer/shared';
import { PageHeader } from '@/components/page-header';
import { useWorkspace } from '@/lib/workspace';
import { CompanyCard } from './company-card';
import { CountingCard } from './counting-card';
import { TeamCard } from './team-card';

export default function SettingsPage() {
  const { workspace } = useWorkspace();
  return (
    // Формы на всю ширину широкого экрана читаются плохо — держим колонку как у документа.
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 md:gap-6">
      <PageHeader title="Настройки" description="Компания, правила подсчёта, команда" />
      <CompanyCard />
      <CountingCard />
      {can(workspace.role, 'members:manage') && <TeamCard />}
    </div>
  );
}
