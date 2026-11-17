import { describe, expect, it } from 'vitest';
import { type CabinetDay, compareSverka, parseSverkaCsv } from './sverka';

describe('parseSverkaCsv', () => {
  it('читает CSV из Excel (;) с запятой в дробях и пустыми ячейками', () => {
    const text =
      '\uFEFFДень;Расход;Реклама;Органика;Direct;Другие;Продажи;Комментарий\r\n' +
      '2026-11-16;12,40;108;6;12;20;0;\r\n' +
      '2026-11-17;;95;;;;;Meta не сверяли\r\n';
    expect(parseSverkaCsv(text)).toEqual([
      {
        day: '2026-11-16',
        values: { spend: 12.4, ad: 108, organic: 6, direct: 12, other: 20, sales: 0 },
        note: '',
      },
      { day: '2026-11-17', values: { ad: 95 }, note: 'Meta не сверяли' },
    ]);
  });

  it('читает CSV из Google Таблиц (,) и ругается на кривую дату', () => {
    expect(parseSverkaCsv('день,реклама\n2026-11-16,1 234\n')[0]!.values).toEqual({ ad: 1234 });
    expect(() => parseSverkaCsv('день,реклама\n16.11.2026,5\n')).toThrow('ГГГГ-ММ-ДД');
    expect(() => parseSverkaCsv('дата,реклама\n2026-11-16,5\n')).toThrow('«день»');
  });
});

describe('compareSverka', () => {
  const cabinet: CabinetDay[] = [
    { day: '2026-11-16', spend: 12.45, ad: 108, organic: 6, direct: 12, other: 20, sales: 0 },
    { day: '2026-11-17', spend: null, ad: 95, organic: 3, direct: 9, other: 18, sales: 1 },
  ];

  it('совпадения не выводит; расход сверяется с допуском 1 %', () => {
    const manual = parseSverkaCsv(
      'день;расход;реклама;органика;direct;другие;продажи\n2026-11-16;12,40;108;6;12;20;0\n',
    );
    expect(compareSverka(manual, cabinet)).toEqual([]);
  });

  it('расхождение в лидах, «нет данных» о расходе и день без цифр кабинета — в списке', () => {
    const manual = parseSverkaCsv(
      'день;расход;реклама;продажи\n2026-11-17;10;96;1\n2026-11-18;;4;\n',
    );
    expect(compareSverka(manual, cabinet)).toEqual([
      { day: '2026-11-17', field: 'spend', manual: 10, cabinet: null },
      { day: '2026-11-17', field: 'ad', manual: 96, cabinet: 95 },
      { day: '2026-11-18', field: 'ad', manual: 4, cabinet: null },
    ]);
  });
});
