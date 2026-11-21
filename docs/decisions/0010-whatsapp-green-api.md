# 0010 — WhatsApp через Green API

Этап 7.3 (22.11.2026). Проверено по документации Green API и Meta 22.11.2026 (источники внизу).

## Контекст

Отчёты нужны и в WhatsApp: у многих клиентов рабочие группы там, а не в Telegram. Отчёт должен
приходить в **уже существующие** группы клиента.

## Решение

WhatsApp сейчас — через **Green API** (неофициальный API). Официальный WhatsApp Business Platform
добавим позже отдельным каналом (например, `whatsapp_cloud`) рядом с `green_api`.

**Как работает Green API.** Инстанс подключается к WhatsApp как ещё одно «связанное устройство»
(как WhatsApp Web): в приложении WhatsApp → Связанные устройства → отсканировать QR из консоли
`console.green-api.com`. Сообщения уходят от этого номера. Один инстанс — один номер. Это сторонний
сервис, не Meta: WhatsApp такие подключения не разрешает, номер могут ограничить или заблокировать.
У Green API есть и отдельный официальный продукт WABA (шаблоны, оплата за сообщения) — его не
используем.

**Доступ.** В консоли у инстанса четыре значения: `apiUrl` (хост методов), `mediaUrl` (хост
отправки файлов), `idInstance`, `apiTokenInstance`. Запрос:
`{host}/waInstance{idInstance}/{метод}/{apiTokenInstance}` — **токен в пути URL**. Хосты — поддомены
`green-api.com` или `greenapi.com`; берём те, что показывает консоль.

| Метод              | Запрос                                            | Что важно                                                                                                                                                   |
| ------------------ | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getStateInstance` | GET `{apiUrl}/…/getStateInstance/…`               | `authorized` — можно слать; `notAuthorized` — нужен QR; `blocked` — заблокирован; `suspended` (`yellowCard`) — ограничения за спам; `starting`, `sleepMode` |
| `getWaSettings`    | GET `{apiUrl}/…/getWaSettings/…`                  | `phone` (пусто, если не авторизован), `stateInstance`                                                                                                       |
| `getContacts`      | GET `{apiUrl}/…/getContacts/…?group=true`         | Только группы. Обновляется до 5 минут. Без `group=true` — телефонная книга номера: **не вызываем**                                                          |
| `sendFileByUpload` | POST `{mediaUrl}/…/sendFileByUpload/…`, multipart | `chatId`, `file`, `fileName` с расширением (по нему — фото или документ), `caption` до 1024. Ответ — `idMessage`                                            |

Id чатов: личный — `…@c.us`, группа — `…@g.us`. Ошибки: 401/403 — неверный токен или инстанс
удалён; 466 — лимит тарифа (Developer — 3 чата, группы считаются); 429 — слишком часто.

**Тарифы (за инстанс в месяц).** Developer — 0 $, только 3 чата, для проверки. Business — 12 $,
чаты без ограничений, для работы.

**Почему не официальный путь.** WhatsApp Business Platform (Cloud API, Meta), Groups API: нужен
Official Business Account; в группе до 8 участников; группы создаёт сам бизнес через API, участники
входят по ссылке — существующую группу клиента подключить нельзя. Номер не блокируют, но для
отчётов в уже существующие группы этот путь не подходит.

## Как это устроено в коде

- Green API — интеграция компании: строка `integrations` типа `green_api`, ключи зашифрованы
  `SecretBox`, в `settings` открыто — `idInstance`, номер, состояние, группы. Один инстанс — одна
  компания: тот же `idInstance` в другой компании подключить нельзя (иначе компания увидит чужие
  группы и сможет отправить туда свой отчёт).
- Группы — `getContacts?group=true`, без вебхуков и `/connect`: номер принадлежит компании, значит
  и его группы.
- Каналы отправки — `DELIVERY_CHANNELS` (`telegram`, `green_api`), получатель отчёта — канал + чат.
- Перед каждой отправкой — `getStateInstance`. Не `authorized` → файл не отправляем: Green API
  держит сообщения неавторизованного номера в очереди 24 часа и отправит их позже — старый отчёт
  пришёл бы внезапно. Доставка с ошибкой, алерт в группу алертов Telegram — один раз при смене
  состояния.
- Токен в пути URL: адрес запроса не попадает в логи, тексты ошибок, Sentry, `deliveries` и аудит.
  Хосты проверяются схемой (`https`, только `green-api.com` / `greenapi.com`) и при подключении,
  и в конструкторе клиента — api не ходит по произвольному адресу пользователя.
- Названия групп и номер — только на экране кабинета.

## Последствия

- Риск блокировки номера. Снижают: отдельный номер, а не личный; номер — обычный участник групп,
  где отчёт ждут; не писать незнакомым; без массовых рассылок. Несколько отчётов в день в свои
  группы — риск низкий, но не нулевой. Владелец подтверждает, что риск принят.
- Квитанций о доставке нет: «доставлено» = Green API принял сообщение (`idMessage`).
- Строка `green_api` — не источник данных: её нет в `SOURCE_TYPES` и адаптерах, в «Источники: …»
  отчёта и проверку свежести она не попадает.

## Источники

- [Green API — Before start](https://green-api.com/en/docs/before-start/)
- [Green API — SendFileByUpload](https://green-api.com/en/docs/api/sending/SendFileByUpload/)
- [Green API — GetContacts](https://green-api.com/en/docs/api/service/GetContacts/)
- [Green API — GetStateInstance](https://green-api.com/en/docs/api/account/GetStateInstance/)
- [Green API — GetWaSettings](https://green-api.com/en/docs/api/account/GetWaSettings/)
- [Green API — Instance status tracking](https://green-api.com/en/docs/api/recommendations/instance-status-tracking/)
- [Green API — Using Green API hosts](https://green-api.com/en/docs/api/recommendations/using-green-api-hosts/)
- [Green API — Ошибка 466, лимиты Developer](https://green-api.com/en/docs/api/466-error-example-body/)
- [Green API — Тарифы](https://green-api.com/en/docs/about-tariffs/)
- [Meta — WhatsApp Groups API](https://developers.facebook.com/documentation/business-messaging/whatsapp/groups/)
