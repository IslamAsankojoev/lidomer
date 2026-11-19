import { cn } from '@/lib/utils';

/** Логотип компании или, пока его нет, первая буква названия на акцентном квадрате. */
export function WorkspaceLogo({
  name,
  logoUrl,
  className,
}: {
  name: string;
  logoUrl: string | null;
  className?: string;
}) {
  if (logoUrl)
    return (
      // eslint-disable-next-line @next/next/no-img-element -- внешний файл из Storage, оптимизация не нужна
      <img
        src={logoUrl}
        alt={`Логотип ${name}`}
        className={cn('size-6 shrink-0 rounded-md object-contain', className)}
      />
    );
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-6 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-semibold text-primary-foreground',
        className,
      )}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
