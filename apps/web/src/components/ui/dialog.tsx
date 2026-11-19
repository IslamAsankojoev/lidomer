'use client';

import * as React from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { ChevronLeftIcon, XIcon } from 'lucide-react';
import { cn } from 'cn';

import { Button } from '@/components/ui/button';

/*
 * Модальное окно под оба экрана. Где какой вид — решают варианты из globals.css:
 * dialog-centered — большой экран: окно по центру поверх затемнённой страницы, крестик справа;
 * dialog-fullscreen — телефон (и лёжа): окно на весь экран и въезжает справа, как новый экран
 * в iOS. Вверху полоса с круглой кнопкой «назад» и заголовком по центру, действия — внизу,
 * под большим пальцем. Классы окна в местах использования — с теми же вариантами.
 *
 * Состав: Dialog → DialogContent → DialogHeader (DialogTitle, DialogDescription),
 * DialogBody (прокручивается), DialogFooter (необязателен).
 */

/** Метка своей записи в истории браузера. */
const HISTORY_KEY = 'lidomerDialog';
const ownsTopEntry = () => window.history.state?.[HISTORY_KEY] === true;

/**
 * Системное «назад» (свайп от края на iPhone, кнопка Android, кнопка браузера) закрывает
 * окно, а не уводит со страницы. Пока окно открыто, на верху истории лежит своя запись
 * с тем же адресом: «назад» снимает её — окно закрывается. Закрыли иначе (крестик, Esc,
 * сохранение) — снимаем запись сами, чтобы следующее «назад» не было холостым.
 * Снятие отложено на такт: в StrictMode React сразу перезапускает эффект, и запись нужна.
 */
function useCloseOnHistoryBack(open: boolean, close: () => void) {
  const onBack = React.useEffectEvent(close);
  const pendingBack = React.useRef<number | undefined>(undefined);
  React.useEffect(() => {
    if (!open) return;
    window.clearTimeout(pendingBack.current);
    // В state у Next.js своё (дерево роутера) — сохраняем и добавляем метку.
    if (!ownsTopEntry())
      window.history.pushState({ ...window.history.state, [HISTORY_KEY]: true }, '');
    const onPopState = () => {
      if (!ownsTopEntry()) onBack();
    };
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      pendingBack.current = window.setTimeout(() => {
        if (ownsTopEntry()) window.history.back();
      });
    };
  }, [open]);
}

/** Управляемое окно (`open` + `onOpenChange`); «назад» закрывает его через `onOpenChange`. */
function Dialog({ actionsRef, ...props }: DialogPrimitive.Root.Props) {
  const ownActions = React.useRef<DialogPrimitive.Root.Actions>(null);
  const actions = actionsRef ?? ownActions;
  useCloseOnHistoryBack(props.open ?? false, () => actions.current?.close());
  return <DialogPrimitive.Root data-slot="dialog" actionsRef={actions} {...props} />;
}

/**
 * Последнее непустое значение. Окно закрывается с анимацией — пусть до конца показывает
 * то, что было открыто, а не пустое место.
 */
function useLastNonNull<T>(value: T | null): T | null {
  const [last, setLast] = React.useState(value);
  if (value !== null && value !== last) setLast(value);
  return value ?? last;
}

function DialogContent({
  className,
  children,
  initialFocus,
  ...props
}: DialogPrimitive.Popup.Props) {
  // Фокус при открытии — на само окно: читалка объявит заголовок, а на крестике
  // не загорится рамка. Tab дальше ведёт по кнопкам и полям как обычно.
  const popupRef = React.useRef<HTMLDivElement>(null);
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop
        data-slot="dialog-overlay"
        className="fixed inset-0 z-50 bg-black/30 transition-opacity duration-300 data-ending-style:opacity-0 data-ending-style:duration-200 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs motion-reduce:transition-none dialog-centered:duration-200 dialog-centered:data-ending-style:duration-150"
      />
      <DialogPrimitive.Popup
        ref={popupRef}
        initialFocus={initialFocus ?? popupRef}
        data-slot="dialog-content"
        className={cn(
          'fixed inset-0 z-50 flex flex-col overflow-hidden bg-popover text-sm text-popover-foreground outline-none',
          // Весь экран: въезжает справа и уезжает туда же — чуть быстрее, чем въезжал.
          'transition-[translate,scale,opacity] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] data-ending-style:duration-200 motion-reduce:transition-none dialog-fullscreen:data-ending-style:translate-x-full dialog-fullscreen:data-starting-style:translate-x-full',
          // По центру: проявляется с лёгким увеличением.
          'dialog-centered:inset-auto dialog-centered:top-1/2 dialog-centered:left-1/2 dialog-centered:max-h-[calc(100dvh-4rem)] dialog-centered:w-[calc(100%-4rem)] dialog-centered:max-w-lg dialog-centered:-translate-x-1/2 dialog-centered:-translate-y-1/2 dialog-centered:rounded-2xl dialog-centered:shadow-2xl dialog-centered:ring-1 dialog-centered:ring-foreground/10 dialog-centered:duration-200 dialog-centered:data-ending-style:scale-95 dialog-centered:data-ending-style:opacity-0 dialog-centered:data-ending-style:duration-150 dialog-centered:data-starting-style:scale-95 dialog-centered:data-starting-style:opacity-0',
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}

/**
 * Шапка. Весь экран: «назад» слева, заголовок с подписью по центру (пустая третья колонка
 * держит его ровно посередине). По центру: заголовок слева, крестик справа.
 */
function DialogHeader({ className, children, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-header"
      className={cn(
        'grid shrink-0 grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-2 border-b px-2 pt-[max(0.375rem,env(safe-area-inset-top))] pb-1.5',
        'dialog-centered:grid-cols-[minmax(0,1fr)_auto] dialog-centered:items-start dialog-centered:gap-4 dialog-centered:pt-4 dialog-centered:pr-3 dialog-centered:pb-3.5 dialog-centered:pl-5',
        className,
      )}
      {...props}
    >
      <DialogPrimitive.Close
        aria-label="Закрыть"
        className="inline-flex size-11 items-center justify-center rounded-full bg-muted text-foreground transition-[scale,opacity] duration-100 outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-90 active:opacity-70 dialog-centered:hidden"
      >
        <ChevronLeftIcon className="size-6 -translate-x-px" strokeWidth={2.25} aria-hidden />
      </DialogPrimitive.Close>
      <div className="flex min-w-0 flex-col gap-0.5 text-center dialog-centered:text-left">
        {children}
      </div>
      <DialogPrimitive.Close
        aria-label="Закрыть"
        render={
          <Button variant="ghost" size="icon-sm" className="hidden dialog-centered:inline-flex" />
        }
      >
        <XIcon />
      </DialogPrimitive.Close>
    </div>
  );
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        'font-heading text-[17px] leading-snug font-semibold text-foreground dialog-fullscreen:truncate dialog-centered:text-lg',
        className,
      )}
      {...props}
    />
  );
}

function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        'text-xs text-muted-foreground dialog-fullscreen:truncate dialog-centered:text-sm',
        className,
      )}
      {...props}
    />
  );
}

/** Содержимое окна: прокручивается само, шапка и действия остаются на месте. */
function DialogBody({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-body"
      className={cn(
        'flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-4 pt-4 pb-6 dialog-centered:px-5',
        className,
      )}
      {...props}
    />
  );
}

/** Действия окна. На весь экран кнопки крупные и делят ширину поровну — под большой палец. */
function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        'flex shrink-0 items-center gap-2 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dialog-centered:justify-end dialog-centered:px-5',
        'dialog-fullscreen:*:data-[slot=button]:h-11 dialog-fullscreen:*:data-[slot=button]:flex-1',
        className,
      )}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  useLastNonNull,
};
