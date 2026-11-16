import { describe, expect, it } from 'vitest';
import { formatApproxSom, toMajor } from './money';

describe('money', () => {
  it('переводит центы в доллары по числу знаков валюты', () => {
    expect(toMajor({ amountMinor: 123450, currency: 'USD' })).toBe(1234.5);
    expect(toMajor({ amountMinor: 500, currency: 'JPY' })).toBe(500);
  });
  it('сомы всегда со знаком ≈', () => {
    expect(formatApproxSom(107800.4).startsWith('≈ ')).toBe(true);
    expect(formatApproxSom(107800.4).endsWith(' сом')).toBe(true);
  });
});
