# 0003 — Устройство web (Next.js 16)

## Контекст

Next.js 16 включает в шаблоне Cache Components и частичный префетч: всё, что читает
cookies или URL, нужно прятать за `<Suspense>`, а статическая оболочка собирается заранее.
Кабинет целиком закрыт входом, а данные приходят только из api.

## Решение

- Cache Components **выключены**: статической части нет, выигрыша нет, а сложность есть.
- Страницы кабинета — клиентские компоненты; данные — TanStack Query через `useApi()`
  (токен Supabase в `Authorization`, компания в `X-Workspace-Id`).
- `src/proxy.ts` (бывший middleware) обновляет cookies сессии Supabase и отправляет на `/login`
  без входа. Это удобство; доступ к данным проверяет только api.
- Приглашение: api вызывает Supabase Admin `invite`, письмо ведёт на `/auth/confirm`
  (`verifyOtp` по `token_hash`), затем `/auth/set-password`. Публичная регистрация в Supabase выключена.
- Компоненты — shadcn/ui на Base UI (`render` вместо `asChild`), утилита `cn` от shadcn.
- Период — в URL через `nuqs`: `?period=week` или `?period=custom&from=…&to=…`; даты считает
  `resolvePreset` из `packages/shared` в поясе компании.
- `packages/shared` и `packages/db` собираются `tsc` в CommonJS (`dist/`); Vercel собирает
  приложения через `turbo run build --filter=<app>...`, чтобы пакеты были собраны раньше.

## Последствия

- Первая отрисовка страниц — скелетон, затем данные; для внутреннего кабинета это приемлемо.
- Если позже понадобится публичная ссылка на отчёт без входа — это отдельный серверный маршрут.
