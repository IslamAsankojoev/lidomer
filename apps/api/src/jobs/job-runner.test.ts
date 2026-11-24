import { describe, expect, it, vi } from 'vitest';
import { JobRunner, type TickReport } from './job-runner';

/** JobRunner только с тем, что нужно пересборке: сверка и Telegram — заглушки. */
function runner(opts: { refresh: () => Promise<string>; failedBefore: boolean }) {
  let failed = opts.failedBefore;
  const reconciliation = {
    refresh: vi.fn(opts.refresh),
    markFailed: vi.fn(async () => {
      const first = !failed;
      failed = true;
      return first;
    }),
    clearFailure: vi.fn(async () => {
      const was = failed;
      failed = false;
      return was;
    }),
  };
  const telegram = {
    reconcileAlert: vi.fn(async () => {}),
    reconcileRecovered: vi.fn(async () => {}),
  };
  const none = {} as never;
  const r = new JobRunner(
    none,
    none,
    none,
    none,
    none,
    reconciliation as never,
    none,
    none,
    telegram as never,
    none,
    none,
  );
  const report: TickReport = { scheduled: 0, processed: 0, failed: 0, rebuilt: 0 };
  return { run: () => r['reconcile']('ws-1', report), reconciliation, telegram, report };
}

describe('сбой пересборки журнала', () => {
  it('первый сбой — алерт с очищенным текстом, повторный — без алерта', async () => {
    const t = runner({
      refresh: async () => {
        throw Object.assign(new Error('relation "reconcile_state" does not exist'), {
          code: '42P01',
        });
      },
      failedBefore: false,
    });
    await t.run();
    await t.run();
    expect(t.telegram.reconcileAlert).toHaveBeenCalledTimes(1);
    expect(t.telegram.reconcileAlert).toHaveBeenCalledWith(
      'ws-1',
      'relation "reconcile_state" does not exist (код 42P01)',
    );
    expect(t.reconciliation.clearFailure).not.toHaveBeenCalled();
  });

  it('отметку сбоя не записать — алерт всё равно уходит', async () => {
    const t = runner({
      refresh: async () => Promise.reject(new Error('boom')),
      failedBefore: false,
    });
    t.reconciliation.markFailed.mockRejectedValueOnce(new Error('no table'));
    await t.run();
    expect(t.telegram.reconcileAlert).toHaveBeenCalledTimes(1);
  });

  it('пересборка снова удалась — сообщение о восстановлении один раз', async () => {
    const t = runner({ refresh: async () => 'full', failedBefore: true });
    await t.run();
    await t.run();
    expect(t.telegram.reconcileRecovered).toHaveBeenCalledTimes(1);
    expect(t.telegram.reconcileAlert).not.toHaveBeenCalled();
    expect(t.report.rebuilt).toBe(2);
  });
});
