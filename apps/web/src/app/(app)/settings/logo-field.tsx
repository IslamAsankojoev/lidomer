'use client';

import { LOGO_MAX_BYTES } from '@lidomer/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { WorkspaceLogo } from '@/components/workspace-logo';
import { useApi } from '@/lib/api';
import { useWorkspace } from '@/lib/workspace';

const ACCEPT = 'image/png,image/jpeg,image/webp';

/** Файл → base64 без префикса data:. */
function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(new Error('Не удалось прочитать файл'));
    r.readAsDataURL(file);
  });
}

/** Логотип в меню слева: загрузить, заменить, убрать. */
export function LogoField({ canEdit }: { canEdit: boolean }) {
  const api = useApi();
  const qc = useQueryClient();
  const { workspace } = useWorkspace();
  const input = useRef<HTMLInputElement>(null);

  const done = async (message: string) => {
    toast.success(message);
    await qc.refetchQueries({ queryKey: ['me'] });
  };
  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (!ACCEPT.split(',').includes(file.type))
        throw new Error('Нужна картинка PNG, JPEG или WebP');
      if (file.size > LOGO_MAX_BYTES) throw new Error('Логотип больше 512 КБ');
      const body = { data: await toBase64(file) };
      return api(z.null(), '/workspace/logo', { workspaceId: workspace.id, method: 'PUT', body });
    },
    onSuccess: () => done('Логотип обновлён'),
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: () =>
      api(z.null(), '/workspace/logo', { workspaceId: workspace.id, method: 'DELETE' }),
    onSuccess: () => done('Логотип убран'),
    onError: (e: Error) => toast.error(e.message),
  });
  const busy = upload.isPending || remove.isPending;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">Логотип</span>
      <div className="flex flex-wrap items-center gap-3">
        <WorkspaceLogo
          name={workspace.name}
          logoUrl={workspace.logoUrl}
          className="size-12 rounded-xl border text-lg"
        />
        {canEdit && (
          <>
            <input
              ref={input}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) upload.mutate(file);
              }}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              {upload.isPending ? 'Загружаем…' : workspace.logoUrl ? 'Заменить' : 'Загрузить'}
            </Button>
            {workspace.logoUrl && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                disabled={busy}
                onClick={() => remove.mutate()}
              >
                Убрать
              </Button>
            )}
          </>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Показывается в меню слева. PNG, JPEG или WebP до 512 КБ, лучше квадратный.
      </p>
    </div>
  );
}
