import { DrizzleQueryError } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { JOURNAL_LAG_MS, journalHealth, reconcileErrorText } from './journal-health';
import { journalNote } from '../reports/reports.service';

const now = new Date('2026-11-24T08:00:00Z');
const ago = (ms: number) => new Date(now.getTime() - ms);

describe('свежесть журнала лидов', () => {
  it('пересборка после синхронизации — свежий', () => {
    expect(journalHealth({ seenAt: ago(60_000), failedAt: null }, [ago(120_000), null])).toEqual({
      updatedAt: ago(60_000),
      stale: false,
    });
  });

  it('синхронизация ушла вперёд больше чем на 30 минут — устарел', () => {
    const seenAt = ago(JOURNAL_LAG_MS + 60_000);
    expect(journalHealth({ seenAt, failedAt: null }, [now]).stale).toBe(true);
    expect(journalHealth({ seenAt: ago(JOURNAL_LAG_MS), failedAt: null }, [now]).stale).toBe(false);
  });

  it('пересборка упала — устарел, даже если синхронизаций нет', () => {
    expect(journalHealth({ seenAt: ago(60_000), failedAt: ago(1000) }, []).stale).toBe(true);
  });

  it('строку создала запись об ошибке — пересчёта ещё не было', () => {
    expect(journalHealth({ seenAt: new Date(0), failedAt: now }, [now])).toEqual({
      updatedAt: null,
      stale: true,
    });
  });

  it('состояния нет: без синхронизаций — не тревожим, с ними — устарел', () => {
    expect(journalHealth(undefined, [null]).stale).toBe(false);
    expect(journalHealth(undefined, [now]).stale).toBe(true);
  });
});

describe('текст ошибки пересборки', () => {
  // Фейковые данные: телефон не настоящий.
  const pg = Object.assign(new Error('relation "reconcile_state" does not exist'), {
    code: '42P01',
  });

  it('ошибка запроса drizzle — только сообщение Postgres, без запроса и параметров', () => {
    const err = new DrizzleQueryError('insert into "leads" values ($1)', ['+996555000001'], pg);
    const text = reconcileErrorText(err);
    expect(text).toBe('relation "reconcile_state" does not exist (код 42P01)');
    expect(text).not.toContain('+996');
  });

  it('запрос без ошибки Postgres внутри — общий текст', () => {
    const err = new DrizzleQueryError('select 1', ['+996555000001']);
    expect(reconcileErrorText(err)).toBe('ошибка запроса к базе');
  });

  it('прочие ошибки — имя и сообщение, обрезано', () => {
    expect(reconcileErrorText(new TypeError('x is undefined'))).toBe('TypeError: x is undefined');
    expect(reconcileErrorText(new Error('a'.repeat(1000))).length).toBe(300);
  });
});

describe('пометка в подписи отчёта', () => {
  const tz = 'Asia/Bishkek';

  it('журнал свежий — пометки нет', () => {
    expect(journalNote({ updatedAt: now, stale: false }, tz, now)).toBeNull();
  });

  it('устарел сегодня — время, в другой день — дата и время по поясу компании', () => {
    expect(journalNote({ updatedAt: ago(3 * 3_600_000), stale: true }, tz, now)).toBe(
      'лиды и метрики пересчитаны на 11:00',
    );
    expect(journalNote({ updatedAt: new Date('2026-11-22T18:44:00Z'), stale: true }, tz, now)).toBe(
      'лиды и метрики пересчитаны на 23 ноября, 00:44',
    );
    expect(journalNote({ updatedAt: null, stale: true }, tz, now)).toBe(
      'лиды и метрики ещё не пересчитаны',
    );
  });
});
