# BotFather: как подключить SkinLab Mini App

По-человечески: Telegram не «хостит» приложение. Он открывает ваш уже задеплоенный сайт внутри себя. Для SkinLab это:

**https://mdakaev.github.io/skinlab/**

Токен бота нужен только серверу (`.env`), никогда — фронтенду и никогда — Git.

---

## 1. Создать бота

1. Откройте Telegram → найдите [@BotFather](https://t.me/BotFather).
2. Отправьте `/newbot`.
3. Имя (как видно людям): например `SkinLab 🌿`.
4. Username (латиница, заканчивается на `bot`): например `SkinLabApp_bot`.

BotFather пришлёт **token** вида `123456:ABC...`.

Сохраните его в локальный `.env`:

```bash
TELEGRAM_BOT_TOKEN=...ваш токен...
TELEGRAM_WEBAPP_URL=https://mdakaev.github.io/skinlab/
```

Файл `.env` уже в `.gitignore`. **Не коммитьте токен. Не вставляйте в HTML/JS.**

---

## 2. Настроить Mini App / Menu Button

В BotFather:

1. `/mybots` → выберите бота.
2. **Bot Settings** → **Menu Button** (или `/setmenubutton`).
3. Укажите текст кнопки: `🌿 Открыть SkinLab`.
4. Укажите URL: `https://mdakaev.github.io/skinlab/`

Либо через Direct Link Mini App (если доступно в вашем BotFather):

- **Configure Mini App** → URL тот же.

После этого у бота внизу чата появится кнопка, которая открывает SkinLab.

---

## 3. Где брать token

- Только у BotFather при создании или через `/token` / API Token в настройках бота.
- Кладёте в `.env` на машине/сервере, где крутится API (`npm start`).

## 4. Где token НЕ должен находиться

- ❌ `public/**` (HTML, JS, CSS)
- ❌ Git / GitHub
- ❌ README с реальным значением
- ❌ логи фронтенда
- ❌ Service Worker cache как «секрет»

---

## 5. Проверить Mini App

1. Откройте бота в Telegram (телефон или Desktop).
2. Нажмите **🌿 Открыть SkinLab** (Menu Button).
3. Должен открыться тот же SkinLab (Botanica).
4. В профиле (на localhost или `?debug=1`) блок Environment → `TELEGRAM`, SDK `available`.
5. Обычный браузер: `https://mdakaev.github.io/skinlab/` по-прежнему работает как Web/PWA.

---

## 6. Webhook бота (опционально, для /start)

Чтобы бот отвечал на `/start` сообщением с кнопкой WebApp, нужен **публичный HTTPS** backend (GitHub Pages для API не подходит).

Эндпоинт:

`POST https://ВАШ-API/api/telegram/webhook?secret=СЕКРЕТ`

Секрет можно получить на сервере из `webhookSecretHint()` (см. `server/src/telegram/auth.js`) — это короткий hash от токена, не сам токен.

Установка webhook через Bot API (с сервера, не из браузера):

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -d "url=https://ВАШ-API/api/telegram/webhook?secret=ВАШ_SECRET"
```

На первом этапе достаточно Menu Button без webhook: Mini App уже открывается.

### Быстрая настройка из проекта

Если в `.env` есть `TELEGRAM_BOT_TOKEN`:

```bash
npm run bot:configure   # команды, описание, Menu Button
npm run bot             # long polling: бот отвечает на /start /help /tip
```

`bot:configure` ставит список команд, описание профиля бота и кнопку меню на Mini App.
`npm run bot` нужен, чтобы бот **отвечал** в чате (без публичного webhook).

---

## 7. Частые ошибки

| Симптом | Что проверить |
|---------|----------------|
| Кнопка не открывает приложение | URL в Menu Button, HTTPS, Pages задеплоен |
| Белый экран | Консоль WebView; пути `/skinlab/` |
| `telegram_not_configured` | `TELEGRAM_BOT_TOKEN` в `.env`, перезапуск API |
| Auth 401 | Передаёте сырой `initData`, не `user.id` с клиента |
