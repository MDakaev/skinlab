# Разработка SkinLab + Telegram Mini App

## Локальный запуск (Web)

```bash
# UI (статика)
./start.sh
# → http://127.0.0.1:4173

# API (лицензии + telegram auth)
# Положите TELEGRAM_BOT_TOKEN в .env (не коммитьте)
npm start
# → http://127.0.0.1:8787
```

Откройте http://127.0.0.1:4173 — режим **WEB**, как обычный PWA.

В профиле на localhost виден блок **Environment (dev)**.

---

## Как тестировать Web / PWA

1. Браузер → `http://127.0.0.1:4173/m1-botanica/?tab=pairs`
2. Проверьте: сочетания, активы, профиль, quiz, paywall.
3. DevTools → Application → Service Worker / Manifest.
4. Environment должен быть `WEB`, SDK обычно `unavailable` (или available, но без initData → всё равно WEB, если platform unknown).

`isTelegramApp()` не должен становиться true только из‑за подключённого script SDK.

---

## Как тестировать Telegram

### Вариант A — прод URL в BotFather (проще)

1. Задеплойте `public/` на GitHub Pages (см. README).
2. В BotFather Menu Button → `https://mdakaev.github.io/skinlab/`
3. Откройте бота в Telegram → Menu Button.
4. Проверьте: SDK, ready/expand, theme, BackButton на drawer, профиль, localStorage, paywall.

### Вариант B — локальный туннель (для отладки до деплоя)

1. Поднимите `./start.sh`.
2. Прогоните HTTPS-туннель (ngrok / cloudflared) на порт 4173.
3. Временно поставьте Menu Button на URL туннеля.
4. После теста верните прод URL.

Telegram **не открывает** `http://127.0.0.1` как Mini App без туннеля.

---

## Как проверить initData

На клиенте (только UI/dev):

- `Telegram.WebApp.initData` — строка есть / нет (в diag: present/absent).
- `initDataUnsafe.user` — только для отображения имени, **не для авторизации**.

На сервере:

```bash
curl -s -X POST http://127.0.0.1:8787/api/telegram/auth \
  -H 'content-type: application/json' \
  -d '{"initData":"СКОПИРОВАННЫЙ_INIT_DATA_ИЗ_MINI_APP"}'
```

Ожидаемо:

- без токена в env → `503 telegram_not_configured`
- битая строка → `401`
- валидная → `{ ok: true, user: { id, firstName, ... } }`

**Нельзя** слать `{ userId: 123 }` и ждать доверия — такого API нет.

Логи сервера пишут только `len=…;has_hash=…`, не полный initData и не token.

---

## Environment variables

| Переменная | Где | Назначение |
|------------|-----|------------|
| `TELEGRAM_BOT_TOKEN` | `.env` / сервер | Bot API + validate initData |
| `TELEGRAM_WEBAPP_URL` | `.env` | URL в кнопке `/start` (по умолчанию Pages) |
| `SKINLAB_DEV_LICENSES` | `.env` | dev-выдача лицензий |
| `YOOKASSA_*` | `.env` | live-оплата |

Фронтенд **не** читает bot token.

---

## Переключить production URL

1. BotFather → Menu Button → новый HTTPS URL.
2. `.env` → `TELEGRAM_WEBAPP_URL=...`
3. Если webhook настроен — обновить URL webhook.
4. Задеплоить фронт (subtree `public` → `gh-pages`).

На этапе 1 канонический URL: **https://mdakaev.github.io/skinlab/**

---

## Структура Telegram-кода

```text
public/shared/telegram.js   # SDK abstraction
public/shared/storage.js    # profile/shelf storage layer
public/shared/share.js      # shareResult
server/src/telegram/auth.js # validateInitData
server/src/telegram/bot.js  # Bot API helpers
server/src/telegram/commands.js
```

Не вызывайте `window.Telegram` напрямую из `app.js` — только через `telegram.js`.
