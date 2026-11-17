import type { Permission } from '@lidomer/shared';
import { BarChart3, Cable, FileText, Image, Settings, Users, type LucideIcon } from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Пункт виден, только если роль даёт это право. */
  permission?: Permission;
  /** Подпись группы в меню. */
  group: string;
}

/** Пункт меню, к которому относится путь. */
export function navItemFor(pathname: string): NavItem | undefined {
  return NAV.find((i) => (i.href === '/' ? pathname === '/' : pathname.startsWith(i.href)));
}

export const NAV: NavItem[] = [
  { href: '/', label: 'Обзор', icon: BarChart3, group: 'Аналитика' },
  { href: '/creatives', label: 'Креативы', icon: Image, group: 'Аналитика' },
  { href: '/leads', label: 'Лиды', icon: Users, group: 'Аналитика' },
  { href: '/reports', label: 'Отчёты', icon: FileText, group: 'Рассылка' },
  {
    href: '/integrations',
    label: 'Интеграции',
    icon: Cable,
    permission: 'integrations:read',
    group: 'Настройка',
  },
  { href: '/settings', label: 'Настройки', icon: Settings, group: 'Настройка' },
];
