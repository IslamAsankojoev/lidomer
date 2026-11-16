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

import { defaultDealStatus, normalizeStageSemantics } from './integrations';

describe('стадии Bitrix24', () => {
  it('семантика в любом виде → единый вид', () => {
    expect(normalizeStageSemantics(null, 'success')).toBe('success');
    expect(normalizeStageSemantics('F', 'failure')).toBe('failure');
    expect(normalizeStageSemantics(null, undefined)).toBe('process');
  });
  it('статус по умолчанию', () => {
    expect(defaultDealStatus('S')).toBe('won');
    expect(defaultDealStatus('failure')).toBe('lost');
    expect(defaultDealStatus('process')).toBe('in_work');
  });
});
