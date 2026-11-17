import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  change,
  formatApproxSom,
  formatMoney,
  type ReportSnapshot,
  reportSnapshotSchema,
  toMajor,
} from '@lidomer/shared';
import { ImageResponse } from 'next/og';
import { env } from '@/lib/env';

export const runtime = 'nodejs';

const dir = join(process.cwd(), 'assets/fonts');
const fontsPromise = Promise.all(
  (['cyrillic', 'latin'] as const).flatMap((subset) =>
    ([400, 700] as const).map(async (weight) => ({
      name: 'Inter',
      data: await readFile(join(dir, `inter-${subset}-${weight}-normal.woff`)),
      weight,
      style: 'normal' as const,
    })),
  ),
);

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
        flex: 1,
        background: C.card,
        borderRadius: 24,
        padding: 28,
        gap: 6,
      }}
    >
      <div style={{ fontSize: 26, color: C.muted }}>{label}</div>
      <div style={{ fontSize: 56, fontWeight: 700, color: C.text }}>{value}</div>
      <div style={{ display: 'flex', fontSize: 24, color: C.muted, gap: 12 }}>
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

/**
 * PNG отчёта для Telegram. Рисуется по снимку цифр запуска, который отдаёт api по подписанной ссылке:
 * картинка и подпись всегда показывают одни и те же цифры.
 */
export async function GET(req: Request, ctx: { params: Promise<{ runId: string }> }) {
  const { runId } = await ctx.params;
  const url = new URL(req.url);
  const qs = new URLSearchParams({
    exp: url.searchParams.get('exp') ?? '',
    sig: url.searchParams.get('sig') ?? '',
  });
  const res = await fetch(
    `${env.NEXT_PUBLIC_API_URL}/internal/report-runs/${encodeURIComponent(runId)}/snapshot?${qs}`,
    {
      cache: 'no-store',
    },
  );
  if (!res.ok)
    return new Response('Нет доступа к снимку', { status: res.status === 401 ? 401 : 404 });
  const s = reportSnapshotSchema.parse(await res.json());
  const c = s.current;
  const b = s.before;
  const cpl = money(s, c.cplFactMinor);
  const spend = money(s, c.spendMinor);

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        background: C.bg,
        padding: 56,
        gap: 28,
        fontFamily: 'Inter',
        color: C.text,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 28, color: C.muted }}>{s.workspaceName}</div>
        <div style={{ fontSize: 52, fontWeight: 700 }}>{s.reportName}</div>
        <div style={{ fontSize: 30, color: C.accent }}>
          {periodLabel(s.period.from, s.period.to)}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 20 }}>
        <Tile
          label="Лиды с рекламы"
          value={int(c.adLeads)}
          delta={change(c.adLeads ?? null, b.adLeads ?? null)}
        />
        <Tile label="Цена за лид" value={cpl.main} sub={cpl.som} />
      </div>
      <div style={{ display: 'flex', gap: 20 }}>
        <Tile label="Расход" value={spend.main} sub={spend.som} />
        <Tile label="Продажи" value={int(c.sales)} sub={`с телефоном ${int(c.withPhone)}`} />
      </div>

      {s.blocks.includes('channels') ? (
        <div style={{ display: 'flex', gap: 28, fontSize: 26, color: C.muted }}>
          <span>{`Органика ${int(c.organicLeads)}`}</span>
          <span>{`Direct без источника ${int(c.directUnknownLeads)}`}</span>
          <span>{`Другие ${int(c.otherLeads)}`}</span>
        </div>
      ) : null}

      {s.blocks.includes('creatives') && s.creatives.length ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            background: C.card,
            borderRadius: 24,
            padding: 28,
            gap: 18,
          }}
        >
          <div style={{ fontSize: 28, fontWeight: 700 }}>Лучшие креативы</div>
          {s.creatives.slice(0, 3).map((cr, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              {cr.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={cr.previewUrl}
                  width={72}
                  height={72}
                  style={{ borderRadius: 12, objectFit: 'cover' }}
                  alt=""
                />
              ) : (
                <div
                  style={{
                    display: 'flex',
                    width: 72,
                    height: 72,
                    borderRadius: 12,
                    background: '#22304a',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 30,
                    color: C.muted,
                  }}
                >
                  {i + 1}
                </div>
              )}
              <div
                style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}
              >
                <div
                  style={{
                    fontSize: 28,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {cr.title}
                </div>
                <div
                  style={{
                    fontSize: 22,
                    color: C.muted,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {cr.subtitle ?? ' '}
                </div>
              </div>
              <div style={{ fontSize: 30, fontWeight: 700 }}>{int(cr.leads)}</div>
            </div>
          ))}
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

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          marginTop: 'auto',
          gap: 6,
          fontSize: 22,
          color: C.muted,
        }}
      >
        {s.dataNote ? <div style={{ color: C.bad }}>{`⚠ ${s.dataNote}`}</div> : null}
        <div>{`Источники: ${s.sources.map((x) => `${x.name} ${x.at ?? '—'}`).join(' · ')}`}</div>
      </div>
    </div>,
    { width: 1080, height: 1350, fonts: await fontsPromise },
  );
}
