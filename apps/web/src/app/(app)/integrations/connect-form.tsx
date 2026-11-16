'use client';

import type { IntegrationType } from '@lidomer/shared';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { facebookLoginAvailable, facebookLoginCode } from '@/lib/facebook';
import { useIntegrationAction } from './use-integrations';

const FIELDS: Partial<
  Record<IntegrationType, { key: string; label: string; placeholder: string; hint: string }>
> = {
  ward: {
    key: 'apiKey',
    label: 'Ключ Ward',
    placeholder: 'wdr_…',
    hint: 'Ward → Подключения → API для отчётов → Создать ключ. После сохранения ключ виден только маской.',
  },
  bitrix24: {
    key: 'webhookUrl',
    label: 'Адрес входящего вебхука',
    placeholder: 'https://портал.bitrix24.kz/rest/1/…/',
    hint: 'Bitrix24 → Разработчикам → Другое → Входящий вебхук, право CRM. Отдельный, не тот, что у Ward.',
  },
  meta_ads: {
    key: 'accessToken',
    label: 'Токен системного пользователя',
    placeholder: 'EAA…',
    hint: 'Запасной путь: Meta Business Suite → Системные пользователи → Создать токен с правом ads_read.',
  },
};

/** Форма подключения: ключ уходит только в api, в браузере не сохраняется. */
export function ConnectForm({ type, reconnect }: { type: IntegrationType; reconnect?: boolean }) {
  const action = useIntegrationAction(type);
  const [value, setValue] = useState('');
  const [manual, setManual] = useState(type !== 'meta_ads' || !facebookLoginAvailable);
  const field = FIELDS[type];
  if (!field) return null;

  const submit = (body: unknown) =>
    action.mutate({ action: 'connect', body }, { onSuccess: () => setValue('') });

  const loginWithFacebook = async () => {
    try {
      submit({ code: await facebookLoginCode() });
    } catch (e) {
      action.reset();
      // Отмена входа — не ошибка, просто ничего не делаем.
      if (e instanceof Error && !e.message.includes('отменён')) throw e;
    }
  };

  if (!manual) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void loginWithFacebook()} disabled={action.isPending}>
          {action.isPending
            ? 'Подключаем…'
            : reconnect
              ? 'Переподключить через Facebook'
              : 'Войти через Facebook'}
        </Button>
        <Button variant="link" size="sm" onClick={() => setManual(true)}>
          Вставить токен вручную
        </Button>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-2 sm:flex-row sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) submit({ [field.key]: value.trim() });
      }}
    >
      <Field className="flex-1">
        <FieldLabel htmlFor={`connect-${type}`}>{field.label}</FieldLabel>
        <Input
          id={`connect-${type}`}
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={field.placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <FieldDescription>{field.hint}</FieldDescription>
      </Field>
      <Button type="submit" disabled={action.isPending || !value.trim()} className="sm:mb-6">
        {action.isPending ? 'Проверяем…' : reconnect ? 'Заменить ключ' : 'Подключить'}
      </Button>
    </form>
  );
}
