'use client';

import { ROLE_LABELS } from '@lidomer/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useWorkspace } from '@/lib/workspace';

export function CompanyCard() {
  const { workspace } = useWorkspace();
  const rows: [string, string][] = [
    ['Название', workspace.name],
    ['Часовой пояс', workspace.timezone],
    ['Валюта показа', workspace.displayCurrency],
    ['Ваша роль', ROLE_LABELS[workspace.role]],
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Компания</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-sm text-muted-foreground">{k}</dt>
              <dd className="text-sm font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
