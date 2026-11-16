# Этап 0 — что делает владелец (пошагово)

Агент не создаёт аккаунты и не видит секреты. Ниже — всё, что нужно сделать руками.
Порядок важен только там, где сказано. Ничего из секретов **не присылайте в чат** —
только вносите в Vercel/Supabase или (ключи интеграций) позже через формы кабинета.

Отмечайте галочки прямо в этом файле или просто пишите агенту «шаг N готов».

---

## 1. GitHub — ✅ уже готово

Репозиторий `IslamAsankojoev/lidomer` есть, `gh` на этом компьютере авторизован.

Дополнительно (1 минута): **Settings → Branches → Add branch ruleset** для `main`:

- Require a pull request before merging
- Require status checks to pass → после первого прогона CI выбрать `ci`

Можно сделать после того, как агент откроет первый PR (тогда проверка `ci` уже будет в списке).

---

## 2. Supabase — два проекта (dev и prod) ⛔ блокирует проверку входа в Этапе 1

1. Зайти на https://supabase.com/dashboard → **New project**.
2. Организация — ваша; **Name**: `lidomer-dev`; **Database Password** — сгенерировать и
   сохранить в менеджер паролей; **Region**: **West EU (Ireland) — eu-west-1** (как dev)
   (см. решение о регионе ниже).
3. Повторить для `lidomer-prod` (тот же регион).
4. В каждом проекте: **Database → Extensions** → включить `pg_cron`, `pg_net`, `pgmq`.
   (Или Integrations → Cron / Queues → Enable — это то же самое.)
5. **Authentication → Sign In / Providers → Email**: включено; **Allow new users to sign up — ВЫКЛЮЧИТЬ**
   (вход только по приглашению). Confirm email — оставить включённым.
6. **Authentication → URL Configuration**:
   - Site URL: пока `http://localhost:3000` (после деплоя заменим на домен web);
   - Redirect URLs: добавить `http://localhost:3000/**` и позже `https://<web-домен>/**`.
7. Для **dev**-проекта собрать значения (они понадобятся в `.env.local` и в Vercel):
   - **Project Settings → API**: `Project URL`, `anon`/`publishable` key, `service_role`/`secret` key;
   - **Project Settings → Database → Connection string → Transaction pooler** (порт 6543) — это `DATABASE_URL`;
   - там же **Session pooler / Direct** (порт 5432) — это `DATABASE_URL_DIRECT` для миграций;
   - **JWT**: `Project Settings → JWT Keys` — агенту нужен только адрес JWKS
     (`https://<ref>.supabase.co/auth/v1/.well-known/jwks.json`), он не секретный.

**Как передать агенту:** создать файл `.env.local` в корне репозитория по образцу
`.env.example` (агент его создаст) и вписать туда значения **dev**-проекта. Файл в
`.gitignore`, в git не попадёт. Агенту в чат — только «`.env.local` заполнен».

---

## 3. Vercel — два проекта из одного репозитория ⛔ блокирует preview-деплой Этапа 1

> Тариф: см. решение ниже — для коммерческого проекта нужен **Pro**.

Делать **после** того, как агент запушит каркас (появятся папки `apps/web` и `apps/api`).

1. https://vercel.com/new → Import `IslamAsankojoev/lidomer`.
2. Проект **web**: Project Name `lidomer-web`, **Root Directory** `apps/web`, Framework — Next.js.
   Build/Install команды не трогать.
3. Ещё раз Import того же репозитория → проект **api**: Project Name `lidomer-api`,
   **Root Directory** `apps/api`, Framework — NestJS (или Other, если NestJS нет в списке).
4. В обоих проектах: **Settings → Functions → Function Region** → `Dublin, Ireland (dub1)`;
   **Settings → Functions → Fluid Compute** — включено.
5. **Settings → Environment Variables** — внести переменные из `.env.example`
   (для Preview — значения dev-проекта Supabase, для Production — prod).
   Ключ шифрования сгенерировать командой ниже **у себя в терминале** и вставить, в чат не присылать:

```bash
openssl rand -base64 32
```

---

## 4. Meta (Facebook) — приложение и доступ к рекламному аккаунту ⛔ блокирует Этап 2

1. https://developers.facebook.com/apps → **Create app** → тип **Business** →
   привязать к вашему бизнес-портфолио.
2. В приложении **Add product**: **Marketing API** и **Facebook Login for Business**.
3. https://business.facebook.com/settings → **Users → System users** → **Add** →
   имя `lidomer-reports`, роль **Employee** (не Admin).
4. Там же **Accounts → Apps** → ваше приложение → назначить системному пользователю.
5. **Accounts → Ad accounts** → ваш рекламный аккаунт → **Assign people** →
   системный пользователь → только **View performance** (чтение). Так же дать
   доступ приложению (Ad account → Connected assets / Apps).
6. В приложении: **Facebook Login for Business → Configurations → Create configuration** →
   тип токена **System-user access token**, право **`ads_read`**, ассеты — рекламный аккаунт.
   Записать **Configuration ID**, **App ID**, **App Secret** (секрет — только в Vercel).
7. Сообщить агенту: «Meta готово, Configuration ID внесён в Vercel».

## 5. Ward — письмо в поддержку (не блокирует, но чем раньше — тем лучше)

Ключ «API для отчётов» уже есть — **не присылайте его**, внесёте через экран «Интеграции» на Этапе 2.

Текст письма в поддержку Ward (можно скопировать):

> Здравствуйте! Мы строим отчёт по рекламе на вашем публичном API для отчётов. Просим:
>
> 1. Отдавать `conversation_id` и структурный источник лида (тип: реклама / пост / Direct, id объявления или поста) в `/leads`, а не только текстовое поле `source`.
> 2. Сохранять рекламную метку (id объявления) для диалогов из Instagram Direct, начатых с рекламы.
> 3. Добавить вебхук о новом лиде и смене его статуса.
>    Спасибо!

## 6. Bitrix24 — отдельный входящий вебхук ⛔ блокирует Этап 2 (Bitrix24)

1. alatoo.bitrix24.kz → **Разработчикам → Другое → Входящий вебхук**.
2. Название: `Отчёты lidomer`; права: **CRM (crm)** — только это.
3. Сохранить. URL вебхука — это секрет: **не присылать**, внесёте в форму кабинета на Этапе 2.
4. Не трогать вебхук, который использует Ward.

## 7. Telegram — бот и группы ⛔ блокирует Этап 5 (но токен нужен в Vercel раньше)

1. В Telegram открыть **@BotFather** → `/newbot` → имя `Lidomer Reports`, username на `_bot`.
   Токен — сразу в Vercel как `TELEGRAM_BOT_TOKEN`, в чат не присылать.
2. `/setprivacy` → выбрать бота → **Disable** не нужно; оставить **Enable** (боту не нужно читать переписку).
3. Создать группу **«Lidomer тест»** и группу **«Отчёты маркетинг»**, добавить бота в обе.

---

## Решения по пунктам «Изучить» этого этапа

См. `docs/decisions/0001-region-and-vercel-plan.md`. Кратко:

- **Регион:** Supabase `eu-west-1` (Ирландия) + Vercel `dub1`.
- **Тариф Vercel:** Hobby запрещает коммерческое использование → нужен **Pro**.

## Готово, когда

- [x] Репозиторий создан, у агента есть доступ.
- [ ] Supabase dev и prod созданы, `.env.local` заполнен значениями dev.
- [ ] Vercel `lidomer-web` и `lidomer-api` созданы, регион fra1.
- [ ] Приложение Meta и доступ к рекламному аккаунту готовы.
- [ ] Вебхук Bitrix24 и бот Telegram созданы.
- [ ] Письмо в поддержку Ward отправлено.
