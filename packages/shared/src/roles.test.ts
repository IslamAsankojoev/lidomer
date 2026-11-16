import { describe, expect, it } from 'vitest';
import { can, ROLES } from './roles';

describe('can', () => {
  it('только владелец управляет командой и настройками', () => {
    for (const role of ROLES) {
      expect(can(role, 'members:manage')).toBe(role === 'owner');
      expect(can(role, 'settings:manage')).toBe(role === 'owner');
    }
  });
  it('наблюдатель не видит контакты и ничего не меняет', () => {
    expect(can('viewer', 'leads:read_contacts')).toBe(false);
    expect(can('viewer', 'reports:manage')).toBe(false);
    expect(can('viewer', 'integrations:manage')).toBe(false);
    expect(can('viewer', 'metrics:read')).toBe(true);
  });
  it('продажи видят лиды с контактами, но не интеграции', () => {
    expect(can('sales', 'leads:read_contacts')).toBe(true);
    expect(can('sales', 'integrations:read')).toBe(false);
  });
});
