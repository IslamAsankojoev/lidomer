import { z } from 'zod';

/** Роли участника компании. Порядок — от большего доступа к меньшему. */
export const ROLES = ['owner', 'marketer', 'sales', 'viewer'] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Владелец',
  marketer: 'Маркетолог',
  sales: 'Продажи',
  viewer: 'Наблюдатель',
};

/** Действия, доступ к которым зависит от роли. */
export const PERMISSIONS = [
  'metrics:read',
  'leads:read',
  'leads:read_contacts',
  'leads:override',
  'reports:read',
  'reports:manage',
  'integrations:read',
  'integrations:manage',
  'settings:manage',
  'members:manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: PERMISSIONS,
  marketer: [
    'metrics:read',
    'leads:read',
    'leads:read_contacts',
    'leads:override',
    'reports:read',
    'reports:manage',
    'integrations:read',
    'integrations:manage',
  ],
  sales: ['metrics:read', 'leads:read', 'leads:read_contacts', 'reports:read'],
  // Наблюдатель видит метрики и лиды, но телефоны — только в маске.
  viewer: ['metrics:read', 'leads:read', 'reports:read'],
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
