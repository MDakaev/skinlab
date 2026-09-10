# HANDOFF — передача SkinLab покупателю

Чеклист, чтобы новый владелец поднял продукт без созвона с продавцом.

**Сначала отдай:** [PROJECT_GUIDE.md](PROJECT_GUIDE.md) — подробная карта «что к чему» простым языком.  
Этот файл — короткий операционный чеклист после сделки.

## 1. Что передаётся

- [ ] Git-репозиторий (весь код Workers + Mini App)
- [ ] Этот файл и `README.md`
- [ ] Список аккаунтов и секретов (в отдельном защищённом канале, не в Git)
- [ ] Доступ к домену (если был)

## 2. Аккаунты (сменить пароли / владельца)

| Сервис | Зачем | Действие после сделки |
|--------|--------|------------------------|
| Cloudflare | Workers + D1 + деплой | добавить покупателя / передать аккаунт |
| Telegram BotFather | токен бота | передать токен; при необходимости перевыпустить |
| Platega | платежи | переоформить мерчанта / сменить ключи |
| Домен / DNS | кастомный URL Mini App | сменить NS/owner |

## 3. Секреты (выписать и ротировать)

После передачи **сразу смени**:

- `TELEGRAM_BOT_TOKEN` (BotFather → Revoke при необходимости)
- `TELEGRAM_WEBHOOK_SECRET` (новый random → `setWebhook` заново)
- `PLATEGA_MERCHANT_ID` / `PLATEGA_SECRET`
- `ADMIN_SECRET`

Команды:

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npx wrangler secret put PLATEGA_MERCHANT_ID
npx wrangler secret put PLATEGA_SECRET
npx wrangler secret put ADMIN_SECRET
```

## 4. Данные пользователей

База **Cloudflare D1** `skinlab` содержит:

- `users` — telegram id / username
- `subscriptions` — `paid_until`
- `payments` — история оплат

Передача = доступ к Cloudflare-аккаунту, где лежит D1. Бэкап:

```bash
npx wrangler d1 export skinlab --remote --output=backup.sql
```

## 5. Проверка после передачи (15 минут)

1. `npm install && npm run deploy`
2. `curl https://YOUR_HOST/health` → `ok: true`
3. В Telegram: `/start` → кнопки отвечают
4. Mini App открывается, legal-страницы открываются
5. Тестовая оплата Platega → подписка активна в Mini App
6. `/admin/` показывает нового пользователя и платёж
7. Callback URL в Platega указывает на новый хост

## 6. Бренд / контент (опционально)

- Название и тексты бота: `src/telegram/handlers.ts`, `src/telegram/api.ts`
- Тарифы: `src/lib/plans.ts`
- UI Mini App: `web/`
- Legal: `web/legal/` — **обязательно** обновить реквизиты оператора под нового владельца

## 7. Legacy в репозитории

Папки `server/`, `public/`, `deploy/`, `docs/` могут остаться от старого Selectel-стека. Они **не** входят в Cloudflare-деплой. Покупатель может удалить их после проверки нового продукта.

## 8. Контакты на время гарантии (заполняет продавец)

- Продавец: _______________
- Срок поддержки после сделки: _______________
- Канал связи: _______________
