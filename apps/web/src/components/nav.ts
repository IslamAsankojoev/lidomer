import { BarChart3, Cable, FileText, Image, Settings, Users, type LucideIcon } from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV: NavItem[] = [
  { href: '/', label: 'Обзор', icon: BarChart3 },
  { href: '/creatives', label: 'Креативы', icon: Image },
  { href: '/leads', label: 'Лиды', icon: Users },
  { href: '/reports', label: 'Отчёты', icon: FileText },
  { href: '/integrations', label: 'Интеграции', icon: Cable },
  { href: '/settings', label: 'Настройки', icon: Settings },
];
