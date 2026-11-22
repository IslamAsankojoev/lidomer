import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { reportPageCount, reportSnapshotSchema } from '@lidomer/shared';
import { ImageResponse } from 'next/og';
import { REPORT_IMAGE_SIZE, ReportCreativesPage, ReportImage } from '@/components/report-image';
import { env } from '@/lib/env';

export const runtime = 'nodejs';

const dir = join(process.cwd(), 'assets/fonts');
/**
 * Satori хранит шрифты по имени семейства и для каждой толщины берёт из семейства один файл.
 * Поэтому наборы Inter — разными семействами: основной «Inter» (латиница, цифры, `$`, `↑`),
 * «Inter Cyrillic» — запасной для русских букв, той же толщины. С одним именем на оба набора
 * `$` и `↑` рисовались квадратом, а жирный русский текст — обычным.
 */
const FAMILIES = { latin: 'Inter', cyrillic: 'Inter Cyrillic' } as const;
const fontsPromise = Promise.all(
  (['latin', 'cyrillic'] as const).flatMap((subset) =>
    ([400, 700] as const).map(async (weight) => ({
      name: FAMILIES[subset],
      data: await readFile(join(dir, `inter-${subset}-${weight}-normal.woff`)),
      weight,
      style: 'normal' as const,
    })),
  ),
);

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
  // Страница файла: 1 — главные цифры, 2… — креативы (PDF).
  const raw = url.searchParams.get('page') ?? '1';
  const page = /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!(page >= 1 && page <= reportPageCount(s.creatives.length)))
    return new Response('Нет такой страницы', { status: 404 });
  const el = page === 1 ? <ReportImage s={s} /> : <ReportCreativesPage s={s} page={page} />;
  return new ImageResponse(el, {
    ...REPORT_IMAGE_SIZE,
    fonts: await fontsPromise,
  });
}
