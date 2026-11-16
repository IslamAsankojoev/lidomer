import { describe, expect, it } from 'vitest';
import { dayRangeUtc, dayStartUtc, isDayKey, shiftDay, toDayKey, today } from './time';

const TZ = 'Asia/Bishkek'; // UTC+6, без перехода на летнее время

describe('toDayKey', () => {
  it('лид в 19:30 UTC — это уже следующий день по Бишкеку', () => {
    expect(toDayKey(new Date('2026-11-15T19:30:00Z'), TZ)).toBe('2026-11-16');
  });
  it('лид в 17:59 UTC — ещё тот же день по Бишкеку', () => {
    expect(toDayKey(new Date('2026-11-15T17:59:59Z'), TZ)).toBe('2026-11-15');
  });
  it('граница суток ровно в 18:00 UTC', () => {
    expect(toDayKey(new Date('2026-11-15T18:00:00Z'), TZ)).toBe('2026-11-16');
  });
});

describe('dayStartUtc / dayRangeUtc', () => {
  it('начало дня по Бишкеку — 18:00 UTC накануне', () => {
    expect(dayStartUtc('2026-11-16', TZ).toISOString()).toBe('2026-11-15T18:00:00.000Z');
  });
  it('интервал включает последний день целиком', () => {
    const r = dayRangeUtc('2026-11-01', '2026-11-30', TZ);
    expect(r.start.toISOString()).toBe('2026-10-31T18:00:00.000Z');
    expect(r.end.toISOString()).toBe('2026-11-30T18:00:00.000Z');
  });
  it('учитывает переход на летнее время в других поясах', () => {
    // 29 марта 2026 в Берлине сутки длятся 23 часа
    const r = dayRangeUtc('2026-03-29', '2026-03-29', 'Europe/Berlin');
    expect(r.end.getTime() - r.start.getTime()).toBe(23 * 3600 * 1000);
  });
});

describe('shiftDay / isDayKey / today', () => {
  it('сдвигает через границу месяца и года', () => {
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('отклоняет несуществующие даты', () => {
    expect(isDayKey('2026-02-30')).toBe(false);
    expect(isDayKey('2026-11-16')).toBe(true);
    expect(isDayKey('16.11.2026')).toBe(false);
  });
  it('сегодня определяется по поясу компании', () => {
    expect(today(TZ, new Date('2026-11-15T20:00:00Z'))).toBe('2026-11-16');
  });
});
