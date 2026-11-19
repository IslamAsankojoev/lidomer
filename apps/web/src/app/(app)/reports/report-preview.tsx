'use client';

import {
  type ReportConfig,
  REPORT_FORMAT_LABELS,
  reportPreviewResponseSchema,
} from '@lidomer/shared';
import { useQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { REPORT_IMAGE_SIZE, ReportImage } from '@/components/report-image';
import { ErrorState, LoadingState } from '@/components/state';
import { Skeleton } from '@/components/ui/skeleton';
import { useApi } from '@/lib/api';
import { useWorkspace } from '@/lib/workspace';

/** Картинка 1080×1350, уменьшенная под ширину контейнера. */
function ScaledImage({ children }: { children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) =>
      setScale(e!.contentRect.width / REPORT_IMAGE_SIZE.width),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div
      ref={box}
      className="relative w-full overflow-hidden rounded-lg border"
      style={{ aspectRatio: `${REPORT_IMAGE_SIZE.width} / ${REPORT_IMAGE_SIZE.height}` }}
    >
      <div
        className="absolute top-0 left-0 flex origin-top-left font-sans"
        style={{ ...REPORT_IMAGE_SIZE, transform: `scale(${scale})` }}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Предпросмотр отчёта: те же цифры, картинка и подпись, что уйдут в Telegram, — за период
 * «как если бы отчёт ушёл сейчас». Ничего не сохраняет и не отправляет.
 */
export function ReportPreview({ name, config }: { name: string; config: ReportConfig }) {
  const api = useApi();
  const { workspace } = useWorkspace();
  const q = useQuery({
    queryKey: ['report-preview', workspace.id, name, config],
    queryFn: () =>
      api(reportPreviewResponseSchema, '/reports/preview', {
        workspaceId: workspace.id,
        method: 'POST',
        body: { name: name.trim() || 'Отчёт', config },
      }),
    staleTime: 60_000,
  });
  if (q.isPending)
    return (
      // Сообщение в чате: картинка 1080×1350 и подпись под ней.
      <LoadingState className="flex flex-col gap-2">
        <Skeleton className="h-3 w-40" />
        <div className="flex flex-col gap-2 rounded-xl bg-muted/60 p-2">
          <Skeleton
            className="w-full rounded-lg bg-card"
            style={{ aspectRatio: `${REPORT_IMAGE_SIZE.width} / ${REPORT_IMAGE_SIZE.height}` }}
          />
          <div className="flex flex-col gap-2 p-1">
            {['w-1/2', 'w-full', 'w-5/6', 'w-2/3'].map((w) => (
              <Skeleton key={w} className={`h-3.5 bg-card ${w}`} />
            ))}
          </div>
        </div>
      </LoadingState>
    );
  if (q.isError) return <ErrorState message={q.error.message} onRetry={() => void q.refetch()} />;
  const { snapshot, caption, rest } = q.data;
  const period =
    snapshot.period.from === snapshot.period.to
      ? snapshot.period.from
      : `${snapshot.period.from}_${snapshot.period.to}`;
  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs text-muted-foreground">
        Так придёт в Telegram · {REPORT_FORMAT_LABELS[config.format]}
      </div>
      {/* Сообщение в чате: вложение и подпись под ним. */}
      <div className="flex flex-col gap-2 rounded-xl bg-muted/60 p-2">
        {config.format === 'pdf' ? (
          <div className="flex items-center gap-2 rounded-lg bg-card p-2 text-sm">
            <span className="flex size-9 items-center justify-center rounded-md bg-destructive/10 text-destructive">
              <FileText className="size-4" aria-hidden />
            </span>
            <span className="min-w-0 truncate font-medium">{`${name.trim() || 'Отчёт'} ${period}.pdf`}</span>
          </div>
        ) : null}
        <ScaledImage>
          <ReportImage s={snapshot} />
        </ScaledImage>
        <p className="px-1 text-sm whitespace-pre-wrap">{caption}</p>
        {rest && <p className="px-1 text-sm whitespace-pre-wrap text-muted-foreground">{rest}</p>}
      </div>
    </div>
  );
}
