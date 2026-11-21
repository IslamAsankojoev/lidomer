import {
  change,
  CREATIVES_PER_PAGE,
  creativesOnPage,
  formatApproxSom,
  formatMoney,
  type ReportSnapshot,
  reportPageCount,
  toMajor,
} from '@lidomer/shared';

/**
 * Страницы отчёта. Один шаблон на двоих: сервер рисует из него PNG (next/og, Satori),
 * конструктор отчётов — предпросмотр в браузере. Только flexbox и инлайн-стили — то, что понимает Satori.
 * Страница 1 — главные цифры (это и PNG), страницы 2… — креативы (только в PDF).
 */
export const REPORT_IMAGE_SIZE = { width: 1080, height: 1350 } as const;

const C = {
  bg: '#0b1220',
  card: '#141c2e',
  text: '#f4f6fb',
  muted: '#93a0b8',
  accent: '#5b8def',
  good: '#3fbf7f',
  bad: '#ef6b5b',
};

const int = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : new Intl.NumberFormat('ru-RU').format(n);
const dayFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', timeZone: 'UTC' });
const periodLabel = (from: string, to: string) =>
  from === to
    ? dayFmt.format(new Date(`${from}T12:00:00Z`))
    : `${dayFmt.format(new Date(`${from}T12:00:00Z`))} — ${dayFmt.format(new Date(`${to}T12:00:00Z`))}`;

function money(
  s: ReportSnapshot,
  minor: number | null | undefined,
): { main: string; som: string | null } {
  if (minor === null || minor === undefined || !s.spendCurrency)
    return { main: 'нет данных', som: 'Meta не подключена' };
  return {
    main: formatMoney({ amountMinor: minor, currency: s.spendCurrency }),
    som: s.fxRate
      ? formatApproxSom(toMajor({ amountMinor: minor, currency: s.spendCurrency }) * s.fxRate)
      : null,
  };
}

function Tile({
  label,
  value,
  sub,
  delta,
}: {
  label: string;
  value: string;
  sub?: string | null;
  delta?: number | null;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        flex: 1,
        background: C.card,
        borderRadius: 24,
        padding: 32,
        gap: 10,
      }}
    >
      <div style={{ fontSize: 28, color: C.muted }}>{label}</div>
      <div style={{ fontSize: 72, fontWeight: 700, color: C.text }}>{value}</div>
      <div style={{ display: 'flex', fontSize: 26, color: C.muted, gap: 12 }}>
        {sub ? <span>{sub}</span> : null}
        {delta !== null && delta !== undefined ? (
          <span style={{ color: delta >= 0 ? C.good : C.bad }}>
            {`${delta >= 0 ? '↑' : '↓'} ${Math.abs(delta)}%`}
          </span>
        ) : null}
      </div>
    </div>
  );
}

const frame = {
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  height: '100%',
  background: C.bg,
  padding: 56,
  gap: 28,
  fontFamily: 'Inter',
  color: C.text,
} as const;

/** Подвал каждой страницы: несвежие данные, источники, маркетолог, номер страницы. */
export function ReportFooter({
  s,
  page,
  pages,
}: {
  s: ReportSnapshot;
  page: number;
  pages: number;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        marginTop: 'auto',
        gap: 24,
        fontSize: 22,
        color: C.muted,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 6 }}>
        {s.dataNote ? <div style={{ color: C.bad }}>{`⚠ ${s.dataNote}`}</div> : null}
        <div>{`Источники: ${s.sources.map((x) => `${x.name} ${x.at ?? '—'}`).join(' · ')}`}</div>
        {s.marketer ? <div>{`Маркетолог — ${s.marketer}`}</div> : null}
      </div>
      {pages > 1 ? <div style={{ whiteSpace: 'nowrap' }}>{`стр. ${page} из ${pages}`}</div> : null}
    </div>
  );
}

/**
 * Страница 1: главные цифры. Плитки растягиваются по высоте — пустой полосы над подвалом нет.
 * Рисуется по снимку цифр запуска, который отдаёт api по подписанной ссылке.
 */
export function ReportImage({ s }: { s: ReportSnapshot }) {
  const c = s.current;
  const b = s.before;
  const cpl = money(s, c.cplFactMinor);
  const spend = money(s, c.spendMinor);

  return (
    <div style={frame}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 28, color: C.muted }}>{s.workspaceName}</div>
        <div style={{ fontSize: 52, fontWeight: 700 }}>{s.reportName}</div>
        <div style={{ fontSize: 30, color: C.accent }}>
          {periodLabel(s.period.from, s.period.to)}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 20 }}>
        <div style={{ display: 'flex', flex: 1, gap: 20 }}>
          <Tile
            label="Лиды с рекламы"
            value={int(c.adLeads)}
            delta={change(c.adLeads ?? null, b.adLeads ?? null)}
          />
          <Tile label="Цена за лид" value={cpl.main} sub={cpl.som} />
        </div>
        <div style={{ display: 'flex', flex: 1, gap: 20 }}>
          <Tile label="Расход" value={spend.main} sub={spend.som} />
          <Tile label="Продажи" value={int(c.sales)} sub={`с телефоном ${int(c.withPhone)}`} />
        </div>
      </div>

      {s.blocks.includes('channels') ? (
        <div style={{ display: 'flex', gap: 28, fontSize: 26, color: C.muted }}>
          <span>{`Органика ${int(c.organicLeads)}`}</span>
          <span>{`Direct без источника ${int(c.directUnknownLeads)}`}</span>
          <span>{`Другие ${int(c.otherLeads)}`}</span>
        </div>
      ) : null}

      {s.blocks.includes('funnel') && s.funnel ? (
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 26, color: C.muted }}
        >
          <span>{`WARD: переписок ${int(s.funnel.conversations)}`}</span>
          <span>{`→ лидов ${int(s.funnel.wardLeads)}`}</span>
          <span>{`→ сделок ${int(s.funnel.withDeal)}`}</span>
          <span>{`→ продаж ${int(s.funnel.sales)}`}</span>
        </div>
      ) : null}

      <ReportFooter s={s} page={1} pages={reportPageCount(s.creatives.length)} />
    </div>
  );
}

const ellipsis = {
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
} as const;

/** Колонки цифр креатива: ширина фиксирована, цифры не переносятся. */
const COLS = [
  { label: 'Лиды', width: 80 },
  { label: 'Расход', width: 160 },
  { label: 'Цена лида', width: 130 },
  { label: 'Продажи', width: 104 },
] as const;

function Num({ width, main, sub }: { width: number; main: string; sub?: string | null }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        width,
        whiteSpace: 'nowrap',
      }}
    >
      <div style={{ fontSize: 28, fontWeight: 700 }}>{main}</div>
      {sub ? <div style={{ fontSize: 20, color: C.muted }}>{sub}</div> : null}
    </div>
  );
}

/** Страница 2…: креативы за период, по 8 на страницу. Расход null — «—» (нет данных Meta), не ноль. */
export function ReportCreativesPage({ s, page }: { s: ReportSnapshot; page: number }) {
  const pages = reportPageCount(s.creatives.length);
  const offset = (page - 2) * CREATIVES_PER_PAGE;
  const cash = (minor: number | null) => {
    if (minor === null || !s.spendCurrency) return { main: '—', som: null };
    const m = money(s, minor);
    return { main: m.main, som: m.som };
  };
  return (
    <div style={frame}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontSize: 24, color: C.muted, ...ellipsis }}>
          {`${s.workspaceName} · ${s.reportName} · ${periodLabel(s.period.from, s.period.to)}`}
        </div>
        <div style={{ fontSize: 44, fontWeight: 700 }}>Креативы</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 16, padding: '0 16px', fontSize: 20, color: C.muted }}>
          <div style={{ display: 'flex', flex: 1 }} />
          {COLS.map((col) => (
            <div
              key={col.label}
              style={{ display: 'flex', justifyContent: 'flex-end', width: col.width }}
            >
              {col.label}
            </div>
          ))}
        </div>
        {creativesOnPage(s.creatives, page).map((cr, i) => {
          const spend = cash(cr.spendMinor);
          const cpl = cash(cr.cplMinor);
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                height: 108,
                gap: 16,
                padding: '10px 16px 10px 10px',
                background: C.card,
                borderRadius: 18,
              }}
            >
              {cr.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={cr.previewUrl}
                  width={88}
                  height={88}
                  style={{ borderRadius: 12, objectFit: 'cover' }}
                  alt=""
                />
              ) : (
                <div
                  style={{
                    display: 'flex',
                    width: 88,
                    height: 88,
                    borderRadius: 12,
                    background: '#22304a',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 30,
                    color: C.muted,
                  }}
                >
                  {offset + i + 1}
                </div>
              )}
              <div
                style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}
              >
                <div style={{ fontSize: 26, ...ellipsis }}>{cr.title}</div>
                <div style={{ fontSize: 20, color: C.muted, ...ellipsis }}>
                  {cr.subtitle ?? ' '}
                </div>
              </div>
              <Num width={COLS[0].width} main={int(cr.leads)} />
              <Num width={COLS[1].width} main={spend.main} sub={spend.som} />
              <Num width={COLS[2].width} main={cpl.main} />
              <Num width={COLS[3].width} main={int(cr.sales)} />
            </div>
          );
        })}
      </div>

      <ReportFooter s={s} page={page} pages={pages} />
    </div>
  );
}
