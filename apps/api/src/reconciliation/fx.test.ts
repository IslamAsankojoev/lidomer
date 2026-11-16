import { describe, expect, it } from 'vitest';
import { parseNbkrXml } from './fx.service';

describe('курс НБКР', () => {
  it('разбирает дату и курсы с запятой и номиналом', () => {
    const xml = `<?xml version="1.0" encoding="windows-1251" ?>
<CurrencyRates Name="Daily Exchange Rates" Date="17.11.2026">
<Currency ISOCode="USD"><Nominal>1</Nominal><Value>87,4494</Value></Currency>
<Currency ISOCode="KZT"><Nominal>100</Nominal><Value>19,67</Value></Currency>
</CurrencyRates>`;
    expect(parseNbkrXml(xml)).toEqual({ day: '2026-11-17', rates: { USD: 87.4494, KZT: 0.1967 } });
  });
  it('мусор — null', () => {
    expect(parseNbkrXml('<html>error</html>')).toBeNull();
  });
});
