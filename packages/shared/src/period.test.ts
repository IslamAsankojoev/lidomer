import { describe, expect, it } from 'vitest';
import { periodSchema, resolvePreset } from './period';

const TZ = 'Asia/Bishkek';
// Понедельник 16 ноября 2026, 01:00 по Бишкеку (а в UTC ещё воскресенье)
const now = new Date('2026-11-15T19:00:00Z');

describe('resolvePreset', () => {
  it('сегодня и вчера — по Бишкеку', () => {
    expect(resolvePreset('today', TZ, now)).toEqual({ from: '2026-11-16', to: '2026-11-16' });
    expect(resolvePreset('yesterday', TZ, now)).toEqual({ from: '2026-11-15', to: '2026-11-15' });
  });
  it('неделя начинается с понедельника', () => {
    expect(resolvePreset('week', TZ, now)).toEqual({ from: '2026-11-16', to: '2026-11-16' });
    const thursday = new Date('2026-11-19T10:00:00Z');
    expect(resolvePreset('week', TZ, thursday)).toEqual({ from: '2026-11-16', to: '2026-11-19' });
  });
  it('месяц — с 1-го числа', () => {
    expect(resolvePreset('month', TZ, now)).toEqual({ from: '2026-11-01', to: '2026-11-16' });
  });
  it('последние 7 и 30 дней включают сегодня', () => {
    expect(resolvePreset('last7', TZ, now)).toEqual({ from: '2026-11-10', to: '2026-11-16' });
    expect(resolvePreset('last30', TZ, now)).toEqual({ from: '2026-10-18', to: '2026-11-16' });
  });
});

describe('periodSchema', () => {
  it('не пропускает перевёрнутый период', () => {
    expect(periodSchema.safeParse({ from: '2026-11-10', to: '2026-11-01' }).success).toBe(false);
    expect(periodSchema.safeParse({ from: '2026-11-01', to: '2026-11-10' }).success).toBe(true);
  });
});
