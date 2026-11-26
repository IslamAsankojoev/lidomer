import {
  change,
  CREATIVES_PER_PAGE,
  creativesOnPage,
  formatApproxSom,
  formatMoney,
  leadWord,
  percent,
  type ReportSnapshot,
  reportFilePages,
  TOP_CREATIVES,
  toMajor,
} from '@lidomer/shared';
import type { ReactNode } from 'react';

/**
 * Страницы отчёта. Один шаблон на двоих: сервер рисует из него PNG (next/og, Satori),
 * конструктор отчётов — предпросмотр в браузере. Только flexbox и инлайн-стили — то, что понимает Satori.
 * Страница 1 повторяет «Обзор» (мобильный вид): период, все лиды с разбивкой, плитки, воронка,
 * лучшие креативы. Страницы 2… — все креативы (только в PDF).
 */
export const REPORT_IMAGE_SIZE = { width: 1080, height: 1350 } as const;

/** Тёмная тема «Обзора»: фон, карточки с тонкой рамкой, приглушённый текст. */
const C = {
  bg: '#0a0a0c',
  card: '#16161a',
  border: '#27272d',
  track: '#26262c',
  text: '#f4f4f6',
  muted: '#9c9ca6',
  accent: '#5b8def',
  good: '#3fbf7f',
  goodBg: 'rgba(63, 191, 127, 0.14)',
  bad: '#ef6b5b',
  /** Знак доллара — «цвет купюры», не путается с зелёным «рост к прошлому». */
  dollar: '#85bb65',
  badBg: 'rgba(239, 107, 91, 0.14)',
};

const int = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : new Intl.NumberFormat('ru-RU').format(n);
const num = (v: number | null | undefined) => (v === undefined ? null : v);
const dayFmt = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const dayShort = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});
const at = (d: string) => new Date(`${d}T12:00:00Z`);
/** «26 ноября 2026» или «1 октября — 31 октября 2026». */
const periodLabel = (from: string, to: string) =>
  from === to
    ? dayFmt.format(at(from)).replace(' г.', '')
    : `${dayShort.format(at(from))} — ${dayFmt.format(at(to)).replace(' г.', '')}`;

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

/**
 * Символы, которых нет в подключённых шрифтах Inter (`≈`, `→`): Satori рисует вместо них квадрат.
 * Рисуем их линиями SVG — картинка не зависит от догрузки шрифтов из сети.
 */
const SYMBOLS: Record<string, string> = {
  '≈': 'M4 9.5c2.7-2 5.3-2 8 0s5.3 2 8 0M4 15.5c2.7-2 5.3-2 8 0s5.3 2 8 0',
  '→': 'M4 12h15M13 6l6 6-6 6',
};

/** Текст с `≈` и `→`, нарисованными SVG. Размер значка — по размеру шрифта. */
function Txt({ children, size }: { children: string; size: number }) {
  const parts = children.split(/(≈|→)/).filter(Boolean);
  if (parts.length === 1 && !SYMBOLS[parts[0]!]) return <span>{children}</span>;
  return (
    <span style={{ display: 'flex', alignItems: 'center', whiteSpace: 'pre' }}>
      {parts.map((p, i) =>
        SYMBOLS[p] ? (
          <svg
            key={i}
            width={size * 0.8}
            height={size * 0.8}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d={SYMBOLS[p]} />
          </svg>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </span>
  );
}

/** Сумма со знаком `$` цвета купюры; остальной текст — как есть. */
function Money({ children }: { children: string }) {
  const parts = children.split(/(\$)/).filter(Boolean);
  if (parts.length === 1 && parts[0] !== '$') return <span>{children}</span>;
  return (
    <span style={{ display: 'flex', alignItems: 'baseline', whiteSpace: 'pre' }}>
      {parts.map((p, i) => (
        <span key={i} style={p === '$' ? { color: C.dollar } : undefined}>
          {p}
        </span>
      ))}
    </span>
  );
}

const ellipsis = {
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
} as const;

const card = {
  display: 'flex',
  flexDirection: 'column',
  background: C.card,
  border: `1px solid ${C.border}`,
  borderRadius: 24,
} as const;

/**
 * Изменение к прошлому периоду, как на «Обзоре»: стрелка и знак, цвет — только добавка к ним.
 * `better` — какое направление хорошее; без него — нейтрально.
 */
function Delta({
  value,
  size,
  better,
}: {
  value: number | null;
  size: number;
  better?: 'up' | 'down';
}) {
  if (value === null)
    return (
      <span style={{ fontSize: size, color: C.muted, whiteSpace: 'nowrap' }}>к прошлому: —</span>
    );
  const good = value !== 0 && better && value > 0 === (better === 'up');
  const bad = value !== 0 && better && !good;
  const shown = Math.abs(value) >= 10 ? Math.round(value) : value;
  return (
    <span
      style={{
        fontSize: size,
        color: good ? C.good : bad ? C.bad : C.muted,
        whiteSpace: 'nowrap',
      }}
    >
      {`${value > 0 ? '↑ +' : value < 0 ? '↓ −' : ''}${Math.abs(shown)}% к прошлому`}
    </span>
  );
}

/** Шапка: компания и название отчёта, справа — период, как вкладка периода на «Обзоре». */
function Header({ s, subtitle }: { s: ReportSnapshot; subtitle?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 24 }}>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 4, minWidth: 0 }}>
        <div style={{ fontSize: 24, color: C.muted, ...ellipsis }}>{s.workspaceName}</div>
        <div style={{ fontSize: 44, fontWeight: 700, ...ellipsis }}>{subtitle ?? s.reportName}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
        {s.periodLabel ? (
          <div
            style={{
              display: 'flex',
              padding: 6,
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: 14,
            }}
          >
            <div
              style={{
                display: 'flex',
                padding: '6px 18px',
                background: C.track,
                borderRadius: 10,
                fontSize: 24,
                fontWeight: 700,
              }}
            >
              {s.periodLabel}
            </div>
          </div>
        ) : null}
        <div style={{ fontSize: 22, color: C.muted }}>
          {periodLabel(s.period.from, s.period.to)}
        </div>
      </div>
    </div>
  );
}

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
        fontSize: 20,
        color: C.muted,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 4 }}>
        {s.dataNote ? <div style={{ color: C.bad }}>{`⚠ ${s.dataNote}`}</div> : null}
        <div>{`Источники: ${s.sources.map((x) => `${x.name} ${x.at ?? '—'}`).join(' · ')}`}</div>
        {s.marketer ? <div>{`Маркетолог — ${s.marketer}`}</div> : null}
      </div>
      {pages > 1 ? <div style={{ whiteSpace: 'nowrap' }}>{`стр. ${page} из ${pages}`}</div> : null}
    </div>
  );
}

/** «Всего лидов (сделок) за период»: крупно все лиды, под ними — откуда они пришли. */
function Hero({ s }: { s: ReportSnapshot }) {
  const c = s.current;
  const b = s.before;
  const total = c.totalLeads ?? 0;
  const prev = num(b.totalLeads);
  const diff = prev === null ? null : total - prev;
  const channels = [
    { label: 'Реклама', key: 'adLeads' },
    { label: 'Органика', key: 'organicLeads' },
    { label: 'Direct без источника', key: 'directUnknownLeads' },
    { label: 'Другие каналы', key: 'otherLeads' },
  ] as const;
  return (
    <div style={{ ...card, padding: '26px 30px', gap: 8 }}>
      <div style={{ fontSize: 24, color: C.muted }}>Всего лидов (сделок) за период</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <span style={{ fontSize: 104, fontWeight: 700, lineHeight: 1 }}>{int(total)}</span>
          <span style={{ fontSize: 36, fontWeight: 700 }}>{leadWord(total)}</span>
        </div>
        {s.compare && diff !== null && diff !== 0 ? (
          <div
            style={{
              display: 'flex',
              padding: '6px 16px',
              borderRadius: 999,
              fontSize: 22,
              color: diff > 0 ? C.good : C.bad,
              background: diff > 0 ? C.goodBg : C.badBg,
            }}
          >
            {`${diff > 0 ? '↑' : '↓'} на ${int(Math.abs(diff))} ${diff > 0 ? 'больше' : 'меньше'}, чем в прошлый период`}
          </div>
        ) : null}
      </div>
      <div style={{ fontSize: 24, color: C.muted }}>{`${int(c.withPhone)} с телефоном`}</div>
      {s.blocks.includes('channels') ? (
        <div
          style={{
            display: 'flex',
            marginTop: 10,
            paddingTop: 18,
            borderTop: `1px solid ${C.border}`,
          }}
        >
          {channels.map((ch, i) => (
            <div
              key={ch.key}
              style={{
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                gap: 4,
                paddingLeft: i ? 22 : 0,
                borderLeft: i ? `1px solid ${C.border}` : 'none',
              }}
            >
              <div style={{ fontSize: 20, color: C.muted }}>{ch.label}</div>
              <div style={{ fontSize: 42, fontWeight: 700 }}>{int(c[ch.key])}</div>
              {s.compare ? (
                <Delta value={change(num(c[ch.key]), num(b[ch.key]))} size={19} better="up" />
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Плитка, как на «Обзоре»: подпись, цифра, строка под ней (сомы) и изменение. */
function Tile({
  label,
  value,
  sub,
  delta,
}: {
  label: string;
  value: string;
  sub?: string | null;
  delta: ReactNode;
}) {
  return (
    <div style={{ ...card, flex: 1, padding: '20px 22px', gap: 4, minWidth: 0 }}>
      <div style={{ fontSize: 20, color: C.muted, ...ellipsis }}>{label}</div>
      <div style={{ display: 'flex', fontSize: 38, fontWeight: 700, ...ellipsis }}>
        <Money>{value}</Money>
      </div>
      <div style={{ display: 'flex', fontSize: 19, color: C.muted, minHeight: 24 }}>
        {sub ? <Txt size={19}>{sub}</Txt> : null}
      </div>
      {delta}
    </div>
  );
}

function Tiles({ s }: { s: ReportSnapshot }) {
  const c = s.current;
  const b = s.before;
  const cpl = money(s, c.cplFactMinor);
  const spend = money(s, c.spendMinor);
  const d = (k: string, better?: 'up' | 'down') =>
    s.compare ? <Delta value={change(num(c[k]), num(b[k]))} size={18} better={better} /> : null;
  return (
    <div style={{ display: 'flex', gap: 16 }}>
      <Tile label="Цена за лид" value={cpl.main} sub={cpl.som} delta={d('cplFactMinor', 'down')} />
      <Tile label="Расход" value={spend.main} sub={spend.som} delta={d('spendMinor')} />
      <Tile label="Продажи" value={int(c.sales)} delta={d('sales', 'up')} />
      <Tile label="Повторы" value={int(c.repeats)} sub="входят во все лиды" delta={d('repeats')} />
    </div>
  );
}

/** Воронка WARD → Bitrix24 с полосами, как на «Обзоре». */
function Funnel({ f }: { f: NonNullable<ReportSnapshot['funnel']> }) {
  const steps = [
    { label: 'Переписки в WARD', value: f.conversations },
    { label: 'Лиды WARD', value: f.wardLeads },
    { label: 'Сделка в Bitrix24', value: f.withDeal },
    { label: 'Продажа', value: f.sales },
  ];
  const max = Math.max(1, ...steps.map((x) => x.value));
  return (
    <div style={{ ...card, flex: 1, padding: '24px 26px', gap: 16, minWidth: 0 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', fontSize: 28, fontWeight: 700 }}>
          <Txt size={28}>Воронка WARD → Bitrix24</Txt>
        </div>
        <div style={{ fontSize: 19, color: C.muted }}>
          Обращения из Instagram и что с ними стало
        </div>
      </div>
      {steps.map((st, i) => {
        const conv = i ? percent(st.value, steps[i - 1]!.value) : null;
        return (
          <div key={st.label} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', fontSize: 22 }}>
              <span style={{ flex: 1 }}>{st.label}</span>
              <span style={{ fontWeight: 700 }}>{int(st.value)}</span>
              {conv !== null ? (
                <span style={{ fontSize: 18, color: C.muted, marginLeft: 10 }}>{`${conv}%`}</span>
              ) : null}
            </div>
            <div style={{ display: 'flex', height: 12, borderRadius: 6, background: C.track }}>
              <div
                style={{
                  display: 'flex',
                  width: `${Math.max(st.value ? 1.5 : 0, (st.value / max) * 100)}%`,
                  height: 12,
                  borderRadius: 6,
                  background: C.accent,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Превью креатива или пустой квадрат, если превью нет (номер — в названии). */
function Thumb({ url, size }: { url: string | null; size: number }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      width={size}
      height={size}
      style={{ borderRadius: 10, objectFit: 'cover' }}
      alt=""
    />
  ) : (
    <div
      style={{
        display: 'flex',
        width: size,
        height: size,
        borderRadius: 10,
        background: C.track,
      }}
    />
  );
}

/** «Лучшие креативы»: топ по лидам с рекламы, как на «Обзоре». */
function TopCreatives({ s }: { s: ReportSnapshot }) {
  const top = s.creatives.slice(0, TOP_CREATIVES);
  return (
    <div style={{ ...card, flex: 1, padding: '24px 26px', gap: 14, minWidth: 0 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontSize: 28, fontWeight: 700 }}>Лучшие креативы</div>
        <div style={{ fontSize: 19, color: C.muted }}>
          {s.format === 'pdf'
            ? 'По числу лидов с рекламы · все — дальше'
            : 'По числу лидов с рекламы'}
        </div>
      </div>
      {top.map((cr, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Thumb url={cr.previewUrl} size={56} />
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 21, ...ellipsis }}>{`${i + 1}. ${cr.title}`}</div>
            <div style={{ fontSize: 17, color: C.muted, ...ellipsis }}>{cr.subtitle ?? ' '}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <div style={{ fontSize: 21, fontWeight: 700, whiteSpace: 'nowrap' }}>
              {`${int(cr.leads)} ${leadWord(cr.leads)}`}
            </div>
            <div style={{ display: 'flex', fontSize: 17, color: C.muted, whiteSpace: 'nowrap' }}>
              <Money>{cr.cplMinor !== null ? `${money(s, cr.cplMinor).main} за лид` : ' '}</Money>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

const frame = {
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  height: '100%',
  background: C.bg,
  padding: 40,
  gap: 18,
  fontFamily: 'Inter',
  color: C.text,
} as const;

/**
 * Страница 1 — как «Обзор»: период, все лиды с разбивкой, плитки, воронка и лучшие креативы рядом.
 * Рисуется по снимку цифр запуска, который отдаёт api по подписанной ссылке.
 */
export function ReportImage({ s }: { s: ReportSnapshot }) {
  const funnel = s.blocks.includes('funnel') ? s.funnel : null;
  const creatives = s.creatives.length > 0;
  return (
    <div style={frame}>
      <Header s={s} />
      <Hero s={s} />
      {s.blocks.includes('kpis') ? <Tiles s={s} /> : null}
      {funnel || creatives ? (
        <div style={{ display: 'flex', gap: 16 }}>
          {funnel ? <Funnel f={funnel} /> : null}
          {creatives ? <TopCreatives s={s} /> : null}
        </div>
      ) : null}
      <ReportFooter s={s} page={1} pages={reportFilePages(s)} />
    </div>
  );
}

/** Колонки цифр креатива: ширина фиксирована, цифры не переносятся. */
const COLS = [
  { label: 'Лиды', width: 80 },
  { label: 'Расход', width: 150 },
  { label: 'Цена лида', width: 120 },
  { label: 'Продажи', width: 96 },
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
      <div style={{ display: 'flex', fontSize: 24, fontWeight: 700 }}>
        <Money>{main}</Money>
      </div>
      {sub ? (
        <div style={{ display: 'flex', fontSize: 17, color: C.muted }}>
          <Txt size={17}>{sub}</Txt>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Страница 2…: все креативы за период, по 12 на страницу — строками, как «Лучшие креативы»
 * на «Обзоре». Расход null — «—» (нет данных Meta), не ноль.
 */
export function ReportCreativesPage({ s, page }: { s: ReportSnapshot; page: number }) {
  const pages = reportFilePages(s);
  const offset = (page - 2) * CREATIVES_PER_PAGE;
  const cash = (minor: number | null) =>
    minor === null || !s.spendCurrency ? { main: '—', som: null } : money(s, minor);
  return (
    <div style={frame}>
      <Header s={s} subtitle="Креативы" />
      <div style={{ ...card, padding: '8px 0' }}>
        <div
          style={{
            display: 'flex',
            gap: 16,
            padding: '10px 24px',
            fontSize: 18,
            color: C.muted,
          }}
        >
          <div style={{ display: 'flex', flex: 1 }}>{`${s.reportName} · по лидам с рекламы`}</div>
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
                gap: 16,
                padding: '10px 24px',
                borderTop: `1px solid ${C.border}`,
              }}
            >
              <Thumb url={cr.previewUrl} size={60} />
              <div
                style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}
              >
                <div style={{ fontSize: 22, ...ellipsis }}>{`${offset + i + 1}. ${cr.title}`}</div>
                <div style={{ fontSize: 17, color: C.muted, ...ellipsis }}>
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
