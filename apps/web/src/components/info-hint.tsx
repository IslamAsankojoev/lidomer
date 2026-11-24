'use client';

import { Popover } from '@base-ui/react/popover';
import { Info } from 'lucide-react';

/**
 * Иконка ⓘ с пояснением «как считается». Поповер, а не tooltip: на телефоне наведения нет —
 * пояснение открывается и закрывается нажатием, на компьютере — ещё и при наведении.
 */
export function InfoHint({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Popover.Root>
      <Popover.Trigger
        openOnHover
        delay={0}
        aria-label={`Как считается: ${label}`}
        className="-m-1 shrink-0 cursor-help p-1 text-muted-foreground hover:text-foreground data-popup-open:text-foreground"
      >
        <Info className="size-3.5" aria-hidden />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="top" sideOffset={4} collisionPadding={16} className="z-50">
          <Popover.Popup className="max-w-72 origin-(--transform-origin) rounded-md bg-foreground px-3 py-1.5 text-xs text-background shadow-md outline-none data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95">
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
