import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Источники с логотипом (файлы — public/brands). */
export type BrandSource = 'ward' | 'bitrix24';

const BRANDS: Record<BrandSource, { label: string; src: string }> = {
  ward: { label: 'Ward', src: '/brands/ward.png' },
  bitrix24: { label: 'Bitrix24', src: '/brands/bitrix24.png' },
};

export function isBrandSource(type: string): type is BrandSource {
  return type in BRANDS;
}

/** Логотип источника (прозрачный фон). Декоративный: рядом всегда есть название. */
export function SourceLogo({ source, className }: { source: BrandSource; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- маленькая статичная иконка, оптимизация не нужна
    <img
      src={BRANDS[source].src}
      alt=""
      aria-hidden
      className={cn('size-4 shrink-0 object-contain', className)}
    />
  );
}

/**
 * Логотип + название источника. `pill` — бейдж с рамкой (таблицы, списки),
 * `plain` — просто значок перед текстом (заголовки, подписи).
 */
export function SourceBadge({
  source,
  variant = 'plain',
  children,
  className,
}: {
  source: BrandSource;
  variant?: 'plain' | 'pill';
  children?: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 align-middle',
        variant === 'pill' &&
          'h-5 rounded-full border bg-card py-0.5 pr-2 pl-1.5 text-xs font-medium text-foreground',
        className,
      )}
    >
      <SourceLogo source={source} />
      {children ?? BRANDS[source].label}
    </span>
  );
}
