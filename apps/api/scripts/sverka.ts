/**
 * Ручная сверка (ТЗ, Этап 6): таблица маркетолога против кабинета за те же дни.
 *
 *   pnpm --filter @lidomer/api sverka <файл.csv> [--workspace <id>]
 *
 * Читает базу из .env.local (DATABASE_URL), только чтение. Печатает расхождения по дням;
 * без расхождений — «сходится». Цифры берутся тем же кодом, что показывает кабинет.
 */
/* eslint-disable no-console -- CLI: результат сверки печатается в терминал. */
import { currencyDigits } from '@lidomer/shared';
import { createDb, workspaces } from '@lidomer/db';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MetricsRepository } from '../src/reconciliation/metrics.repository';
import {
  type CabinetDay,
  compareSverka,
  parseSverkaCsv,
  SVERKA_FIELDS,
} from '../src/reconciliation/sverka';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  const wsArg = args.includes('--workspace') ? args[args.indexOf('--workspace') + 1] : undefined;
  if (!file) throw new Error('Укажите файл: pnpm --filter @lidomer/api sverka <файл.csv>');
  const manual = parseSverkaCsv(readFileSync(resolve(process.cwd(), file), 'utf8'));
  if (!manual.length) throw new Error('В таблице нет строк с днями');

  const { db, client } = createDb(process.env.DATABASE_URL!, { max: 1 });
  try {
    const all = await db.select({ id: workspaces.id, name: workspaces.name }).from(workspaces);
    const real = all.filter((w) => !w.name.startsWith('test-'));
    const ws = wsArg ? all.find((w) => w.id === wsArg) : real.length === 1 ? real[0] : undefined;
    if (!ws)
      throw new Error(
        `Укажите компанию: --workspace <id>. Компании: ${real.map((w) => `${w.name} (${w.id})`).join(', ')}`,
      );

    const days = manual.map((m) => m.day).sort();
    const repo = new MetricsRepository(db);
    const meta = await repo.metaConnected(ws.id);
    const [counts, points] = await Promise.all([
      repo.counts(ws.id, days[0]!, days.at(-1)!, meta),
      repo.daily(ws.id, days[0]!, days.at(-1)!, meta),
    ]);
    const currency = counts.spendCurrency ?? 'USD';
    const cabinet: CabinetDay[] = points.map((p) => ({
      day: p.day,
      spend: p.spendMinor === null ? null : p.spendMinor / 10 ** currencyDigits(currency),
      ad: p.adLeads,
      organic: p.organicLeads,
      direct: p.directUnknownLeads,
      other: p.otherLeads,
      sales: p.sales,
    }));

    const diffs = compareSverka(manual, cabinet);
    console.log(`Компания: ${ws.name}. Дни: ${days[0]} — ${days.at(-1)} (${manual.length}).`);
    if (!meta) console.log('Meta Ads не подключена — расход в кабинете «нет данных».');
    if (!diffs.length) {
      console.log('Сходится: расхождений нет.');
      return;
    }
    console.log(`Расхождений: ${diffs.length}`);
    console.table(
      diffs.map((d) => ({
        день: d.day,
        поле: SVERKA_FIELDS[d.field],
        маркетолог: d.manual,
        кабинет: d.cabinet ?? 'нет данных',
        разница: d.cabinet === null ? '' : +(d.cabinet - d.manual).toFixed(2),
        комментарий: manual.find((m) => m.day === d.day)?.note ?? '',
      })),
    );
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(2);
});
