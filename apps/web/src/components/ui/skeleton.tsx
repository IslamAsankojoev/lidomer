import { cn } from 'cn';

/** Плашка-заглушка: серый фон и бегущий блик (светлее в тёмной теме, темнее в светлой). */
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn(
        'animate-skeleton rounded-md bg-muted bg-[linear-gradient(90deg,transparent_30%,color-mix(in_oklch,var(--foreground)_6%,transparent)_50%,transparent_70%)] bg-size-[200%_100%] bg-no-repeat motion-reduce:animate-none',
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
