# SkinLab

Telegram-бот + Mini App помощник по уходу за кожей.

Стек: **Cloudflare Workers** (Hono) + **D1** + статическая Mini App. Платежи: **Platega**. Подходит для запуска из РФ (Workers ходят к `api.telegram.org` без прокси).

Продукт рассчитан на передачу целиком: исходники, README, [PROJECT_GUIDE.md](PROJECT_GUIDE.md), [HANDOFF.md](HANDOFF.md), чеклист [SHIP.md](SHIP.md).

## Что умеет

- Бот: `/start`, кнопки «Открыть SkinLab», «Совет», «Инфо», «Поддержка»
- Mini App: полный UI (сочетания, идеал, мой уход, профиль) + **3 дня trial** + подписка Platega
- Platega: создание оплаты + webhook → продление `paid_until`
- Admin: `/admin/` — пользователи, оплаты, выручка (секрет `ADMIN_SECRET`)
- Legal: `/legal/privacy.html`, `/legal/offer.html` (пользовательское соглашение + тарифы)
- В боте: кнопки «Соглашение» / «Конфиденциальность», команды `/terms` `/privacy` `/support`

## Структура

```
src/
  index.ts          # маршруты Worker
  telegram/         # Bot API + обработчики апдейтов
  platega/          # создание платежа + проверка callback
  db/               # D1-запросы
  admin/            # auth для статистики
  lib/              # тарифы, validateInitData
web/                # Mini App, legal, admin UI
migrations/         # схема D1
```

Старые папки `server/`, `public/`, `deploy/` — **legacy Selectel/Fastify**, не используются этим деплоем.

## Быстрый старт (локально)

Требования: Node ≥ 20, аккаунт Cloudflare.

```bash
npm install
cp .dev.vars.example .dev.vars
# заполни TELEGRAM_BOT_TOKEN, секреты, Platega (можно позже)

npx wrangler login
npx wrangler d1 create skinlab
# вставь database_id в wrangler.toml

npm run db:migrate:local
npm run dev
```

### Локальный просмотр редизайна

В ветке `redesign_v2` полноразмерный дизайн подключён к настоящим экранам `web/`. Для просмотра без Telegram, D1 и платежей запусти адаптер:

```bash
node tools/local-design/server.mjs
```

Открой `http://127.0.0.1:4174/` или мобильный просмотр `http://127.0.0.1:4174/mobile`. Адаптер использует демонстрационный профиль с заполненной полкой и открытым доступом, а запросы оплаты и защищённые API оставляет отключёнными. Эти настройки действуют только на loopback и не участвуют в Cloudflare deployment.

Открой `http://127.0.0.1:8787/`. Mini App auth работает только с реальным `initData` из Telegram (в браузере без бота увидишь paywall и подсказку).

## Деплой

```bash
npm run db:migrate:remote
npm run deploy
```

Секреты в проде:

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npx wrangler secret put PLATEGA_MERCHANT_ID
npx wrangler secret put PLATEGA_SECRET
npx wrangler secret put ADMIN_SECRET
```

В `wrangler.toml` → `[vars]` задай:

- `PUBLIC_BASE_URL` = `https://skinlab.<subdomain>.workers.dev` (или свой домен)
- `SUPPORT_USERNAME` = username поддержки без `@` (сейчас `MDakaev`)
- `SUPPORT_EMAIL` = почта поддержки (сейчас `musafir-dakaev@ya.ru`)

### Telegram webhook

Предпочтительно через `secret_token` (секрет в заголовке, не в URL):

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://YOUR_HOST/telegram/webhook" \
  -d "secret_token=TELEGRAM_WEBHOOK_SECRET" \
  -d 'allowed_updates=["message"]'
```

Старый вариант `?secret=` в URL тоже ещё принимается (совместимость).

Настройка Menu Button / команд:

```bash
curl -X POST "https://YOUR_HOST/telegram/configure?secret=TELEGRAM_WEBHOOK_SECRET"
# или: -H "X-Telegram-Bot-Api-Secret-Token: TELEGRAM_WEBHOOK_SECRET"
```

### Platega

1. В кабинете укажи Callback URL: `https://YOUR_HOST/api/platega/webhook`
2. Ключи — в secrets Worker (`PLATEGA_MERCHANT_ID`, `PLATEGA_SECRET` обязательны)
3. В Mini App пользователь получает ссылку оплаты и возвращается на `/?paid=1`

### Admin

Открой `https://YOUR_HOST/admin/` и введи `ADMIN_SECRET` (минимум 16 символов).  
API принимает только заголовок `X-Admin-Secret` (не `?secret=`).

## Тарифы

Правь в [`src/lib/plans.ts`](src/lib/plans.ts) — единый источник для API и UI.

| plan | срок | цена |
|------|------|------|
| m1 | 1 мес | 290 ₽ |
| m3 | 3 мес | 690 ₽ |
| m6 | 6 мес | 1190 ₽ |
| m12 | 12 мес | 1990 ₽ |

## Безопасность

- `initData` проверяется HMAC на сервере
- Platega: пустые ключи → отказ; CONFIRMED только после проверки API Platega
- Admin только по `X-Admin-Secret` (длинный секрет)
- Секреты не коммитить (`.dev.vars`, `.env`)

## Документы

| Файл | Зачем |
|------|--------|
| [PROJECT_GUIDE.md](PROJECT_GUIDE.md) | Подробно: что где лежит, как работает, что менять |
| [HANDOFF.md](HANDOFF.md) | Чеклист передачи покупателю |
| [SHIP.md](SHIP.md) | Чеклист «готово к продаже / деплою» |

## Передача покупателю

См. [HANDOFF.md](HANDOFF.md) и полный разбор в [PROJECT_GUIDE.md](PROJECT_GUIDE.md).

---

Информация в приложении носит справочный характер и не заменяет консультацию дерматолога.
