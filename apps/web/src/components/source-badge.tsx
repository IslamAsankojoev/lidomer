import { INTEGRATION_LABELS, type IntegrationType } from '@lidomer/shared';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Логотип есть у каждой интеграции: источники и каналы отправки (файлы — public/brands). */
export type BrandSource = IntegrationType;

/** `darkSrc` — вариант для тёмной темы (у Ward левая половина W белая и на светлом фоне не видна). */
const BRANDS: Record<BrandSource, { label: string; src: string; darkSrc?: string }> = {
  meta_ads: { label: INTEGRATION_LABELS.meta_ads, src: '/brands/meta.png' },
  ward: { label: 'WARD', src: '/brands/ward.png', darkSrc: '/brands/ward-dark.png' },
  bitrix24: { label: 'Bitrix24', src: '/brands/bitrix24.png' },
  telegram: { label: 'Telegram', src: '/brands/telegram.svg' },
  // Без «· Green API» из INTEGRATION_LABELS: рядом с логотипом это канал, а не способ подключения.
  green_api: { label: 'WhatsApp', src: '/brands/whatsapp.png' },
};

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
 * Логотип + название источника. `pill` — бейдж с заливкой (таблицы, списки),
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
          'h-5 rounded-full bg-muted py-0.5 pr-2 pl-1.5 text-xs font-medium text-foreground',
        className,
      )}
    >
      <SourceLogo source={source} />
      {children ?? (
        // WARD — заглавными и чуть жирнее, как на сайте бренда.
        <span className={source === 'ward' ? 'font-semibold tracking-wide' : undefined}>
          {BRANDS[source].label}
        </span>
      )}
    </span>
  );
}
