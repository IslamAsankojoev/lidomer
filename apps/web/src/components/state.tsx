import { AlertTriangle, Inbox } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Общие состояния экранов: загрузка, нет данных, ошибка. Нули вместо «нет данных» не показываем.
 *
 * Загрузка — каркас того, что появится (плашки из components/skeletons.tsx повторяют форму
 * таблиц, карточек и графиков), поэтому при подгрузке ничего не прыгает. Читалка экрана
 * слышит «Загрузка…», сами плашки от неё скрыты.
 */
export function LoadingState({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className={className}>
      <span className="sr-only">Загрузка…</span>
      {children}
    </div>
  );
}

export function EmptyState({
  title = 'Нет данных',
  description,
  action,
}: {
  title?: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
      <Inbox className="size-8 text-muted-foreground" aria-hidden />
      <div className="font-medium">{title}</div>
      {description && <p className="max-w-md text-sm text-muted-foreground">{description}</p>}
      {action}
    </div>
  );
}

export function ErrorState({
  title = 'Не удалось загрузить',
  message,
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 px-6 py-12 text-center"
    >
      <AlertTriangle className="size-8 text-destructive" aria-hidden />
      <div className="font-medium">{title}</div>
      {message && <p className="max-w-md text-sm text-muted-foreground">{message}</p>}
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Повторить
        </Button>
      )}
    </div>
  );
}
