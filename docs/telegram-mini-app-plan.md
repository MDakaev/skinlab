# Telegram Mini App — план интеграции SkinLab

Статус: Phase 2–9 реализованы (abstraction, SDK, UI, Back/MainButton, auth foundation, docs).

Прод URL Mini App (этап 1): `https://mdakaev.github.io/skinlab/`

---

## 1. Текущая архитектура

```text
public/
  index.html              → редирект в m1-botanica/?tab=pairs
  m1-botanica/
    index.html            → оболочка UI (stage / phone / tabbar / drawers)
    app.js                → весь UI-рендер и навигация (~1486 строк)
    theme.css             → Botanica design system
  shared/
    data.js               → каталог активов и правил
    engine.js             → checkCombo, поиск, профиль (localStorage)
    ideal.js              → идеальная рутина
    schedule.js           → недельный план
    quiz.js               → тест типа кожи
    license.js            → entitlement + checkout/redeem
    theme.js / pwa.js / fluid.js / content.js / …
  sw.js / manifest.webmanifest
server/src/
  server.js, routes.js, license.js, knowledge.js, …
```

**Запуск**

| Режим | Как |
|-------|-----|
| Web UI | `./start.sh` → `http://127.0.0.1:4173` (статика из `public/`) |
| API | `npm start` → `http://127.0.0.1:8787` |
| Прод | GitHub Pages: subtree `public` → ветка `gh-pages` |

**Ключевые факты аудита**

- Единственный UI: Botanica (`m1-botanica`). Альтернативные макеты удалены.
- Shared core уже отделён от UI — идеальная база для Telegram-оболочки.
- **Нет** абстракции environment/runtime (`WEB` / `TELEGRAM`).
- **Нет** упоминаний Telegram SDK / WebApp.
- Профиль: `skinlab.profile.v1` в `engine.js` → `localStorage`.
- Лицензия: `skinlab.license.v1` + `POST /api/license/checkout|redeem`.
- Paywall уже есть: free = Сочетания + Активы; Pro = Идеал + Мой уход.
- Viewport: уже `100dvh` + `env(safe-area-inset-*)` в `theme.css`.
- Drawers: `createDrawer` в `fluid.js`; Escape закрывает overlay → sheet.
- PWA: SW кеширует shell; network-first. Секретов в SW нет.
- Backend: Fastify + CORS `origin: true`. Bot token / Telegram auth отсутствуют.
- Deploy: remote `MDakaev/skinlab`, Pages на `/skinlab/`.

---

## 2. Что переиспользуем без переписывания

| Слой | Модули | Действие |
|------|--------|----------|
| Экспертные данные | `data.js`, `engine.js`, `ideal.js`, `schedule.js`, `quiz.js` | без изменений логики |
| UI / дизайн | `m1-botanica/*`, `theme.css`, `base.css` | точечные правки |
| Paywall | `license.js` + overlays в `app.js` | без дублирования |
| PWA | `sw.js`, `pwa.js`, manifest | мелкие правки (новые файлы в SHELL, без секретов) |
| API каталога / ЮKassa | `server/src/*` | только добавить telegram foundation |

Telegram = дополнительная оболочка, не второй продукт.

---

## 3. Файлы, которые добавляем

```text
public/shared/telegram.js      # SDK-абстракция: isTelegramApp, ready, expand, Back/MainButton, share
public/shared/storage.js       # слой get/save Profile & Shelf (сейчас → localStorage)
public/shared/env.js           # WEB | TELEGRAM, isDev, диагностика (опционально внутри telegram.js)
public/shared/share.js         # shareResult(): Telegram → Web Share → clipboard fallback
server/src/telegram/auth.js    # validateInitData(initData, botToken) по алгоритму Telegram
server/src/telegram/bot.js     # минимальный /start + web_app кнопка (без тяжёлых deps)
server/src/telegram/commands.js

docs/telegram-mini-app-plan.md     # этот файл
docs/telegram-setup.md             # BotFather пошагово
docs/telegram-development.md       # локальная разработка и тест
docs/telegram-monetization.md      # будущий flow лицензии ↔ Telegram ID
```

Опционально (если удобнее в одном месте):

```text
public/m1-botanica/telegram-boot.js  # init ready/expand/theme/BackButton — тонкий boot
```

Или boot вызывается из `app.js` через import `telegram.js` — предпочтительно меньше файлов.

---

## 4. Файлы, которые изменяем

| Файл | Зачем |
|------|--------|
| `public/m1-botanica/index.html` | `<script src="https://telegram.org/js/telegram-web-app.js">` до app.js |
| `public/m1-botanica/app.js` | boot Telegram; BackButton ↔ drawers; MainButton точечно; hide Install в TG; share; storage через abstraction; dev-диагностика |
| `public/m1-botanica/theme.css` | класс `html.is-telegram`: `--tg-theme-*` как мягкий оверлей на Botanica; viewport/safe-area |
| `public/shared/engine.js` | делегировать profile/shelf в `storage.js` (API `loadProfile`/`saveProfile` сохранить) |
| `public/shared/license.js` | без ломки API; позже — привязка к Telegram (пока только комментарий / hook) |
| `public/shared/pwa.js` | не регистрировать SW / не показывать Install внутри Telegram |
| `public/sw.js` | добавить новые shared-модули в SHELL; **не** кешировать initData/API secrets |
| `server/src/routes.js` | `POST /api/telegram/auth` (validate initData → user id); опционально webhook stub |
| `server/src/server.js` | подключение telegram routes / env |
| `.env.example` | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBAPP_URL` |
| `README.md` | ссылка на docs Telegram |

**Не трогаем:** `data.js`, экспертные правила, React/Vue, отдельный hosting.

---

## 5. Режим Web / PWA

1. Открытие в браузере → `Telegram.WebApp` отсутствует или без `initData`.
2. `isTelegramApp()` → `false`.
3. Обычный flow: localStorage, PWA install, SW, ЮKassa return URL.
4. Никакие вызовы Telegram API не бросают ошибок (no-ops в абстракции).

---

## 6. Режим Telegram

1. BotFather Menu Button → `https://mdakaev.github.io/skinlab/` → редирект в Botanica.
2. SDK загружен → `isTelegramApp()` → `true`.
3. Boot: `ready()`, `expand()`, опционально `disableVerticalSwipes` если стабильно.
4. Theme: CSS vars Telegram подмешиваются осторожно (bg/text/hint/button), бренд Botanica остаётся.
5. Viewport: `100dvh` + safe-area; при наличии — `viewportStableHeight` / CSS var от SDK.
6. BackButton: закрывает overlay → sheet; на корневом табе — скрыт / не перехватывает.
7. MainButton: только там, где реально нужен CTA (например «Собрать уход» / «Сохранить» в плане) — не везде.
8. Install PWA скрыт; SW можно не регистрировать в TG (избежать лишнего кеша WebView).
9. User из `initDataUnsafe` — только UI/dev; auth — через backend validation.

---

## 7. Будущая схема авторизации

```text
Telegram WebApp
    │  initData (signed string)
    ▼
POST /api/telegram/auth
    │  server: HMAC-SHA-256 validate (TELEGRAM_BOT_TOKEN)
    ▼
{ telegramUserId, firstName, username }  // доверенно
    │
    ▼
(будущее) session / profile binding
```

**Сейчас (этап 1):** helper `auth.js` + endpoint validate; frontend **не** доверяет `initDataUnsafe` для entitlement.

**Нельзя:** принимать `user.id` с клиента как доказательство; хранить bot token во frontend.

---

## 8. Будущая схема лицензии

```text
Telegram user (validated)
       ↓
SkinLab API: license bound to telegram_id
       ↓
Pro: Идеал + Мой уход
```

**Сейчас:** `skinlab.license.v1` в localStorage + redeem code / ЮKassa — без изменений поведения.

**Подготовка:** `storage.js` abstraction; документ `telegram-monetization.md`; опционально поле `telegramId` в license meta на сервере позже.

Paywall UI — существующий, без Telegram-клона бизнес-логики.

---

## 9. Порядок реализации (Phase 2–9)

| Phase | Содержание | Критерий «не сломать Web» |
|-------|------------|---------------------------|
| 2 | `telegram.js` + `storage.js` + `share.js` | модули не подключены → zero impact |
| 3 | SDK script + boot + `isTelegramApp` | вне TG поведение = как сейчас |
| 4 | CSS theme/viewport `is-telegram` | только при классе на `<html>` |
| 5 | BackButton / MainButton | no-op вне TG |
| 6 | User abstraction (UI only) | без auth claims |
| 7 | `server/src/telegram/auth.js` + route + bot MVP | env optional; API без token → 503 |
| 8 | docs: setup / development / monetization | — |
| 9 | Regression + security checklist | Web + PWA smoke |

---

## 10. Риски и потенциальные проблемы

1. **GitHub Pages = статика.** API (`license`, telegram auth) на Pages недоступен — нужен отдельный backend host для production auth/payments (уже так для ЮKassa).
2. **ЮKassa return URL** в Telegram WebView может вести себя иначе, чем в Safari — проверить redirect / deep link позже.
3. **localStorage в Telegram** привязан к WebView origin; смена устройства ≠ sync — ожидаемо на этапе 1.
4. **Subtree deploy** `public` → `gh-pages`: новые файлы в `public/shared/` попадут на Pages; `server/` и `docs/` — нет (это ок).
5. **Внешний SDK** `telegram.org/js/telegram-web-app.js` не кешировать как секрет; SW может кешировать сам скрипт как статику — initData не кешируется.
6. **CORS:** для Mini App origin `mdakaev.github.io` backend должен разрешать его (сейчас `origin: true` — ок для dev).

---

## 11. Критерий готовности этапа

Минимально работающий Mini App = тот же SkinLab Botanica внутри Telegram с:

- определением режима TELEGRAM;
- `ready` / `expand`;
- theme/viewport без поломки Web;
- BackButton для drawers;
- безопасной абстракцией без bot token во frontend;
- server-side foundation для validate initData;
- документацией BotFather + local dev.

Не считается готовым: «только вставили script SDK».
