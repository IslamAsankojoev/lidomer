# Этап 1 — что делает владелец

Код каркаса готов (ветка `etap-1-karkas`, PR). Чтобы проверить вход и закрыть этап, нужны
шаги ниже. Сначала — шаг 2 из `etap-0.md` (Supabase dev-проект).

## 1. Заполнить `.env.local` (локально, в git не попадает)

```bash
cp .env.example .env.local
```

Открыть `.env.local` и вписать значения **dev**-проекта Supabase:

| Переменная                                 | Где взять                                                    |
| ------------------------------------------ | ------------------------------------------------------------ |
| `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL` | Project Settings → API → Project URL (одно и то же значение) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`            | Project Settings → API Keys → `anon` / `publishable`         |
| `SUPABASE_SERVICE_ROLE_KEY`                | Project Settings → API Keys → `service_role` / `secret`      |
| `DATABASE_URL`                             | Connect → Transaction pooler (порт **6543**)                 |
| `DATABASE_URL_DIRECT`                      | Connect → Session pooler (порт **5432**)                     |
| `SEED_WORKSPACE_NAME`                      | Название вашей компании                                      |
| `SEED_OWNER_EMAIL`                         | Ваш email                                                    |

Агенту написать только «`.env.local` заполнен» — значения не присылать.

## 2. Ключи подписи JWT

Project Settings → **JWT Keys**: должны быть **асимметричные** ключи (ECC P-256 / RSA).
Если там «Legacy JWT secret» — нажать **Migrate JWT secret** → **Rotate keys**.
api проверяет токены по публичным ключам и не хранит общий секрет.

## 3. Шаблон письма-приглашения

Authentication → **Emails** → **Invite user** → заменить ссылку в теле письма на:

```html
<h2>Вас пригласили в «Отчёт для маркетинга»</h2>
<p>
  <a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=invite"
    >Принять приглашение и задать пароль</a
  >
</p>
```

Authentication → URL Configuration → **Redirect URLs** должны содержать
`http://localhost:3000/**` и (после деплоя) `https://<домен web>/**`.

## 4. Создать таблицы и компанию (агент сделает сам, когда `.env.local` готов)

```bash
pnpm db:migrate
```

Затем пригласить себя: Supabase → Authentication → Users → **Add user → Send invitation** →
ваш email. Принять письмо (ссылка откроет кабинет и попросит задать пароль) и запустить:

```bash
pnpm db:seed
```

Сид создаст компанию и сделает вас владельцем. Дальше маркетолога приглашаете уже из
кабинета: **Настройки → Команда → Пригласить**.

## 5. Vercel (шаг 3 из `etap-0.md`)

После мержа PR или прямо из ветки:

| Проект        | Root Directory | Переменные окружения                                                                                                      |
| ------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `lidomer-web` | `apps/web`     | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_URL` = адрес api                            |
| `lidomer-api` | `apps/api`     | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `WEB_ORIGIN` = адрес web, `WEB_ORIGIN_PATTERN` (для preview) |

Команды сборки и установки уже заданы в `apps/*/vercel.json` — в настройках их не трогать.
В обоих проектах: Settings → Functions → Region → **fra1**.

Для preview-деплоев web на api задать
`WEB_ORIGIN_PATTERN` = `https://lidomer-web-[a-z0-9-]+-<ваш-team-slug>\.vercel\.app`
(slug видно в адресе любого preview).

## 6. Проверка (закрывает Этап 1)

- войти с компьютера и с телефона;
- пригласить маркетолога, он принимает письмо и входит;
- выбрать период «Неделя», обновить страницу — период сохранился.
