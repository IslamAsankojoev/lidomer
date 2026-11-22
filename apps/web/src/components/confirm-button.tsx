'use client';

import { type ComponentProps, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * Кнопка необратимого действия с подтверждением в своём окне. Не `window.confirm`:
 * во встроенных браузерах и webview он сразу возвращает «нет», и действие молча не срабатывает.
 */
export function ConfirmButton({
  title,
  description,
  confirmLabel,
  onConfirm,
  ...button
}: Omit<ComponentProps<typeof Button>, 'onClick'> & {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button {...button} onClick={() => setOpen(true)} />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <DialogDescription>{description}</DialogDescription>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setOpen(false);
                onConfirm();
              }}
            >
              {confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
