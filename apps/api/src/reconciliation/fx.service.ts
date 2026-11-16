import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Db, fxRates } from '@lidomer/db';
import { toDayKey } from '@lidomer/shared';
import { and, eq } from 'drizzle-orm';
import { DB } from '../db/db.module';

export const NBKR_DAILY_URL = 'https://www.nbkr.kg/XML/daily.xml';

/** Разбор XML Нацбанка КР: дата и курсы «сомов за 1 единицу». */
export function parseNbkrXml(xml: string): { day: string; rates: Record<string, number> } | null {
  const date = /<CurrencyRates[^>]*Date="(\d{2})\.(\d{2})\.(\d{4})"/.exec(xml);
  if (!date) return null;
  const rates: Record<string, number> = {};
  const re =
    /<Currency ISOCode="([A-Z]{3})">\s*<Nominal>(\d+)<\/Nominal>\s*<Value>([\d,.]+)<\/Value>/g;
  for (let m = re.exec(xml); m; m = re.exec(xml)) {
    const value = Number(m[3]!.replace(',', '.')) / Number(m[2]);
    if (Number.isFinite(value) && value > 0) rates[m[1]!] = value;
  }
  return { day: `${date[3]}-${date[2]}-${date[1]}`, rates };
}

/** Курс доллара к сому: Нацбанк отдаёт только текущий день — сохраняем раз в день. */
@Injectable()
export class FxService {
  private readonly log = new Logger(FxService.name);

  constructor(@Inject(DB) private readonly db: Db) {}

  async ensureToday(fetchFn: typeof fetch = fetch): Promise<void> {
    const today = toDayKey(new Date(), 'Asia/Bishkek');
    const [has] = await this.db
      .select({ day: fxRates.day })
      .from(fxRates)
      .where(and(eq(fxRates.currency, 'USD'), eq(fxRates.day, today)));
    if (has) return;
    try {
      const res = await fetchFn(NBKR_DAILY_URL);
      const parsed = parseNbkrXml(await res.text());
      if (!parsed || !parsed.rates.USD) throw new Error('нет курса USD в ответе');
      await this.db
        .insert(fxRates)
        .values(
          Object.entries(parsed.rates).map(([currency, rate]) => ({
            currency,
            day: parsed.day,
            rate: String(rate),
            source: `НБКР ${parsed.day.split('-').reverse().join('.')}`,
          })),
        )
        .onConflictDoNothing();
    } catch (err) {
      // Курс справочный: без него сомы просто не показываются.
      this.log.warn(`Курс НБКР не получен: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
