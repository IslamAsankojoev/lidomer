import { describe, expect, it } from 'vitest';
import { creativesOnPage, dueSlot, reportPageCount, reportPeriodRange, slotUtc } from './reports';

const TZ = 'Asia/Bishkek';

describe('расписание отчётов', () => {
  it('09:00 по Бишкеку — это 03:00 UTC', () => {
    expect(slotUtc('2026-11-17', '09:00', TZ).toISOString()).toBe('2026-11-17T03:00:00.000Z');
  });
  it('слот срабатывает в окне 10 минут и только один раз по времени', () => {
    const s = { times: ['09:00'], weekdays: [], monthDays: [] };
    expect(dueSlot(s, TZ, new Date('2026-11-17T02:59:00Z'))).toBeNull();
    expect(dueSlot(s, TZ, new Date('2026-11-17T03:00:00Z'))?.toISOString()).toBe(
      '2026-11-17T03:00:00.000Z',
    );
    expect(dueSlot(s, TZ, new Date('2026-11-17T03:09:00Z'))?.toISOString()).toBe(
      '2026-11-17T03:00:00.000Z',
    );
    expect(dueSlot(s, TZ, new Date('2026-11-17T03:11:00Z'))).toBeNull();
  });
  it('неделя — только по понедельникам, месяц — только 1-го', () => {
    const week = { times: ['10:00'], weekdays: [1], monthDays: [] };
    expect(dueSlot(week, TZ, new Date('2026-11-16T04:01:00Z'))).not.toBeNull(); // пн
    expect(dueSlot(week, TZ, new Date('2026-11-17T04:01:00Z'))).toBeNull(); // вт
    const month = { times: ['10:00'], weekdays: [], monthDays: [1] };
    expect(dueSlot(month, TZ, new Date('2026-12-01T04:05:00Z'))).not.toBeNull();
    expect(dueSlot(month, TZ, new Date('2026-12-02T04:05:00Z'))).toBeNull();
  });
  it('слот около полуночи по поясу компании', () => {
    const s = { times: ['00:05'], weekdays: [], monthDays: [] };
    // 00:05 Бишкека 18 ноября = 18:05 UTC 17 ноября
    expect(dueSlot(s, TZ, new Date('2026-11-17T18:07:00Z'))?.toISOString()).toBe(
      '2026-11-17T18:05:00.000Z',
    );
  });
});

describe('период отчёта', () => {
  it('вчера, сегодня, 7 дней', () => {
    expect(reportPeriodRange('yesterday', '2026-11-17')).toEqual({
      from: '2026-11-16',
      to: '2026-11-16',
    });
    expect(reportPeriodRange('today', '2026-11-17')).toEqual({
      from: '2026-11-17',
      to: '2026-11-17',
    });
    expect(reportPeriodRange('last7', '2026-11-17')).toEqual({
      from: '2026-11-10',
      to: '2026-11-16',
    });
  });
  it('прошлая неделя — с понедельника по воскресенье', () => {
    expect(reportPeriodRange('prev_week', '2026-11-16')).toEqual({
      from: '2026-11-09',
      to: '2026-11-15',
    });
    expect(reportPeriodRange('prev_week', '2026-11-19')).toEqual({
      from: '2026-11-09',
      to: '2026-11-15',
    });
  });
  it('прошлый месяц, включая переход года', () => {
    expect(reportPeriodRange('prev_month', '2026-12-01')).toEqual({
      from: '2026-11-01',
      to: '2026-11-30',
    });
    expect(reportPeriodRange('prev_month', '2027-01-01')).toEqual({
      from: '2026-12-01',
      to: '2026-12-31',
    });
  });
});

describe('страницы файла отчёта', () => {
  it('первая — цифры, дальше по 8 креативов', () => {
    expect([0, 1, 8, 9].map(reportPageCount)).toEqual([1, 2, 2, 3]);
  });
  it('креативы страниц 2 и 3', () => {
    const list = Array.from({ length: 11 }, (_, i) => i);
    expect(creativesOnPage(list, 2)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(creativesOnPage(list, 3)).toEqual([8, 9, 10]);
  });
});
