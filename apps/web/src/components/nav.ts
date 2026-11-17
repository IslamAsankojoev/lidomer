import type { Permission } from '@lidomer/shared';
import { BarChart3, Cable, FileText, Image, Settings, Users, type LucideIcon } from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Пункт виден, только если роль даёт это право. */
  permission?: Permission;
  /** Раздел считает цифры за период — в шапке показываем выбор периода. */
  period?: true;
}

/** Пункт меню, к которому относится путь. */
export function navItemFor(pathname: string): NavItem | undefined {
  return NAV.find((i) => (i.href === '/' ? pathname === '/' : pathname.startsWith(i.href)));
}

export const NAV: NavItem[] = [
  { href: '/', label: 'Обзор', icon: BarChart3, period: true },
  { href: '/creatives', label: 'Креативы', icon: Image, period: true },
  { href: '/leads', label: 'Лиды', icon: Users, period: true },
  { href: '/reports', label: 'Отчёты', icon: FileText },
  { href: '/integrations', label: 'Интеграции', icon: Cable, permission: 'integrations:read' },
  { href: '/settings', label: 'Настройки', icon: Settings },
];
