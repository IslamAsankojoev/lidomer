import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Источники с логотипом (файлы — public/brands). */
export type BrandSource = 'ward' | 'bitrix24';

/** `darkSrc` — вариант для тёмной темы (у Ward левая половина W белая и на светлом фоне не видна). */
const BRANDS: Record<BrandSource, { label: string; src: string; darkSrc?: string }> = {
  ward: { label: 'Ward', src: '/brands/ward.png', darkSrc: '/brands/ward-dark.png' },
  bitrix24: { label: 'Bitrix24', src: '/brands/bitrix24.png' },
};

export function isBrandSource(type: string): type is BrandSource {
  return type in BRANDS;
}

/** Логотип источника (прозрачный фон). Декоративный: рядом всегда есть название. */
export function SourceLogo({ source, className }: { source: BrandSource; className?: string }) {
  const { src, darkSrc } = BRANDS[source];
  const cls = cn('size-4 shrink-0 object-contain', className);
  /* eslint-disable @next/next/no-img-element -- маленькая статичная иконка, оптимизация не нужна */
  if (!darkSrc) return <img src={src} alt="" aria-hidden className={cls} />;
  return (
    <>
      <img src={src} alt="" aria-hidden className={cn(cls, 'dark:hidden')} />
      <img src={darkSrc} alt="" aria-hidden className={cn(cls, 'hidden dark:block')} />
    </>
  );
  /* eslint-enable @next/next/no-img-element */
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
