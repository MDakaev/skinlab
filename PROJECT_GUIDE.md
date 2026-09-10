# SkinLab — подробный гид по проекту

Документ для владельца продукта: **ты можешь не уметь программировать**, но умеешь открывать файлы и менять понятные строки (цены, тексты, контакты). Здесь — что это за продукт, как куски связаны, куда лезть и куда **не** лезть.

Связанные короткие файлы:

| Файл | Роль |
|------|------|
| [README.md](README.md) | Быстрый старт и деплой |
| [HANDOFF.md](HANDOFF.md) | Чеклист передачи покупателю |
| [SHIP.md](SHIP.md) | «Можно продавать / задеплоено?» |
| **Этот файл** | Полная карта: логика, папки, сценарии, поломки |

---

## 1. Одной фразой

**SkinLab** — Telegram-бот + веб-приложение внутри Telegram (Mini App) про уход за кожей. Пользователь открывает приложение из бота, получает **3 дня бесплатно**, потом платит через **Platega**, доступ хранится в базе Cloudflare **D1**. Админка смотрит статистику и шлёт рассылки.

---

## 2. Картинка «кто с кем говорит»

```
Пользователь в Telegram
        │
        ├─ пишет боту ──► Telegram ──webhook──► наш Worker (src/index.ts)
        │                                            │
        │                                            ├─ отвечает текстом (бот)
        │                                            └─ пишет в D1 (пользователь, trial)
        │
        └─ жмёт «Открыть SkinLab» ──► Mini App (папка web/)
                                           │
                                           ├─ POST /api/auth     (кто я? есть подписка?)
                                           ├─ POST /api/checkout (создать оплату)
                                           └─ UI: идеал, уход, квиз… (всё в браузере)

Platega (оплата) ──webhook──► POST /api/platega/webhook ──► продлить paid_until в D1

Ты (владелец) ──► /admin/ + ADMIN_SECRET ──► статистика, gift-доступ, рассылки

Cloudflare Cron (каждые 5 мин) ──► напоминания утро/вечер + дожим рассылок
```

**Важно:** рабочий прод — это **Cloudflare Workers**, не старые папки `server/` / `public/` / `deploy/`. Они от прошлой версии (Selectel). Их можно игнорировать или удалить после проверки, что новый стек работает.

---

## 3. Что где лежит (карта папок)

```
cosmetics-consulting/
├── src/                    ← «мозг» сервера (TypeScript → Worker)
│   ├── index.ts            ← ВСЕ HTTP-маршруты + cron
│   ├── env.ts              ← список секретов и переменных (типы)
│   ├── admin/auth.ts       ← проверка ADMIN_SECRET
│   ├── db/queries.ts       ← все запросы к базе D1
│   ├── lib/plans.ts        ← тарифы и цены (менять здесь)
│   ├── lib/telegram-auth.ts← проверка, что Mini App открыт из Telegram
│   ├── platega/client.ts   ← создание платежа + проверка callback
│   ├── telegram/           ← ответы бота, кнопки, команды
│   ├── reminders/          ← ежедневные напоминания
│   └── broadcast/runner.ts ← рассылка сообщений всем пользователям
│
├── web/                    ← то, что видит пользователь в Mini App
│   ├── index.html          ← оболочка приложения
│   ├── app.js              ← склейка экранов
│   ├── shared/             ← модули: квиз, идеал, лицензия, тема…
│   ├── admin/index.html    ← админка (секрет в поле ввода)
│   ├── legal/              ← оферта и политика
│   └── assets/             ← иконки, шрифты
│
├── migrations/             ← схема базы (SQL). Не редактируй руками на проде —
│                           │ только через `npm run db:migrate:remote`
├── wrangler.toml           ← имя Worker, ID базы, публичные переменные, cron
├── package.json            ← команды: dev, deploy, migrate
├── .dev.vars.example       ← образец секретов для локалки (копируй в .dev.vars)
└── .env.example            ← справочник имён секретов
```

В начале почти каждого файла в `src/` есть **блок-комментарий** — зачем файл нужен. Читай его первым.

---

## 4. Внешние сервисы (аккаунты)

Без этих четырёх продукт «не живёт»:

| Сервис | Зачем | Где править |
|--------|--------|-------------|
| **Cloudflare** | Хостинг Worker + база D1 + статика `web/` | Dashboard + `wrangler` CLI |
| **Telegram BotFather** | Токен бота | Токен → секрет `TELEGRAM_BOT_TOKEN` |
| **Platega** | Приём оплаты (СБП и т.п.) | `PLATEGA_MERCHANT_ID`, `PLATEGA_SECRET` + Callback URL |
| **Твой домен** (опционально) | Красивый URL вместо `*.workers.dev` | DNS → Cloudflare |

Секреты **никогда не кладут в Git**. В проде:

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npx wrangler secret put PLATEGA_MERCHANT_ID
npx wrangler secret put PLATEGA_SECRET
npx wrangler secret put ADMIN_SECRET
```

Локально: файл `.dev.vars` (не коммитить), образец — `.dev.vars.example`.

---

## 5. Секреты и публичные переменные

### Секреты (только `wrangler secret` / `.dev.vars`)

| Имя | Зачем | Если пусто / слабый |
|-----|--------|---------------------|
| `TELEGRAM_BOT_TOKEN` | Бот и проверка Mini App | Бот и `/api/auth` не работают |
| `TELEGRAM_WEBHOOK_SECRET` | Чтобы чужой не слал фейковые апдейты боту | Webhook отвечает 403 |
| `PLATEGA_MERCHANT_ID` | Магазин в Platega | Оплата и webhook закрыты |
| `PLATEGA_SECRET` | Подпись запросов Platega | То же |
| `ADMIN_SECRET` | Вход в `/admin/` и admin API | Минимум **16 символов**; слабые вроде `admin` отклоняются |

### Публичные переменные (`wrangler.toml` → `[vars]`)

| Имя | Сейчас (пример) | Зачем |
|-----|------------------|--------|
| `PUBLIC_APP_NAME` | SkinLab | Название |
| `PUBLIC_BASE_URL` | `https://skinlab….workers.dev` | Ссылки в боте, return URL оплаты |
| `SUPPORT_USERNAME` | без `@` | Кнопка поддержки |
| `SUPPORT_EMAIL` | почта | Legal / саппорт |
| `OWNER_TELEGRAM_IDS` | числовой id | Вечный бесплатный доступ владельцу |

Свой Telegram id: напиши боту [@userinfobot](https://t.me/userinfobot) или посмотри в админке после `/start`.

---

## 6. База данных (D1) — простыми словами

Одна база `skinlab`. Таблицы появляются из файлов в `migrations/` по порядку:

| Миграция | Что добавляет |
|----------|----------------|
| `0001_init.sql` | `users`, `subscriptions`, `payments` |
| `0002_reminders.sql` | настройки утренних/вечерних напоминаний |
| `0003_user_profile.sql` | профиль из Mini App (JSON) |
| `0004_broadcasts.sql` | рассылки + флаг «пользователь заблокировал бота» |
| `0005_broadcast_recipients.sql` | учёт получателей рассылки |

Ключевые поля:

- **`subscriptions.paid_until`** — до какой даты доступ открыт (ISO-время). Если дата в будущем → доступ есть.
- **`subscriptions.plan_id`** — `trial` / `m1`…`m12` / `owner` / `gift`.
- **`payments.status`** — `pending` → `confirmed` (или `canceled` / `chargeback`).

Все SQL-запросы собраны в `src/db/queries.ts` — **не пиши SQL в обход**, если не уверен.

Бэкап:

```bash
npx wrangler d1 export skinlab --remote --output=backup.sql
```

---

## 7. Как устроен доступ (подписка)

1. Человек пишет `/start` или открывает Mini App.
2. Сервер узнаёт его `telegram_id`.
3. Если id в `OWNER_TELEGRAM_IDS` → план `owner` до `2099` года.
4. Иначе один раз выдаётся **trial на 3 дня** (`TRIAL_DAYS` в `src/lib/plans.ts`).
5. После оплаты Platega webhook ставит `paid_until` = сейчас (или конец текущего срока) **+ месяцы тарифа**.
6. В админке можно выдать **gift** на N дней или forever.

Mini App спрашивает сервер через `POST /api/auth` (`web/shared/license.js`).  
Экран «закрыто» в браузере — это удобство; **истина** лежит в D1. Контент (идеал, расписания) лежит статикой в `web/shared/` — техничный пользователь теоретически может открыть JS без оплаты. Для консультационного продукта это обычно приемлемо; сервер всё равно не отдаёт «чужие» данные по чужому id.

---

## 8. Деньги: путь оплаты

1. В Mini App пользователь выбирает план → `POST /api/checkout` с `initData` + `planId`.
2. Worker создаёт строку в `payments` и просит Platega ссылку.
3. Пользователь платит на сайте Platega, возвращается на `/?paid=1`.
4. Platega бьёт в `POST /api/platega/webhook` с заголовками `X-MerchantId` / `X-Secret`.
5. Worker **ещё раз** спрашивает Platega API: статус реально `CONFIRMED`?
6. Только тогда `payments` → `confirmed` и продлевается `subscriptions`.

Callback URL в кабинете Platega:

`https://ТВОЙ_ХОСТ/api/platega/webhook`

Цены меняй **только** в `src/lib/plans.ts` (массив `PLANS`), потом `npm run deploy`. И обнови тексты в `web/legal/offer.html`, если там перечислены тарифы.

---

## 9. Бот: что отвечает

Логика: `src/telegram/handlers.ts`  
Тексты кнопок и сообщений: `src/telegram/api.ts`  
Напоминания (диалог настройки): `src/reminders/bot.ts`  
Тексты пушей утро/вечер: `src/reminders/scheduler.ts` (`MORNING_REMINDER_TEXT`, `EVENING_REMINDER_TEXT`)

Команды / кнопки (примерно):

| Действие | Что делает |
|----------|------------|
| `/start` | Приветствие, клавиатура, trial/owner |
| Открыть SkinLab | Кнопка WebApp на `PUBLIC_BASE_URL` |
| Совет / Инфо / Поддержка | Готовые тексты |
| `/terms` `/privacy` | Ссылки на legal-страницы |
| `/reminders` | Мастер настройки напоминаний |

После смены текстов бота и деплоя иногда нужно обновить меню:

```bash
curl -X POST "https://ТВОЙ_ХОСТ/telegram/configure?secret=ТВОЙ_WEBHOOK_SECRET"
```

Webhook Telegram (предпочтительно):

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://ТВОЙ_ХОСТ/telegram/webhook" \
  -d "secret_token=ТВОЙ_WEBHOOK_SECRET" \
  -d 'allowed_updates=["message"]'
```

Старый вариант с `?secret=` в URL тоже ещё работает.

---

## 10. Mini App (`web/`)

| Файл / папка | Простыми словами |
|--------------|------------------|
| `index.html` | Каркас страницы |
| `app.js` | Какие экраны показывать |
| `shared/quiz.js` | Квиз |
| `shared/ideal.js` | «Идеал» / рекомендации |
| `shared/schedule.js` | Расписание ухода |
| `shared/license.js` | Связь с `/api/auth` и paywall |
| `shared/telegram.js` | Обёртка Telegram WebApp |
| `shared/content.js` / `data.js` | Контент (тексты подсказок) |
| `theme.css` / `shared/theme.js` | Внешний вид |
| `legal/*.html` | Юридические страницы — **обязательно** свои реквизиты при передаче |
| `admin/index.html` | Админка |

Менять контент ухода/советов — смотри `web/shared/content.js` и `data.js`.  
Менять paywall-тексты — `app.js` + `license.js`.

---

## 11. Админка

URL: `https://ТВОЙ_ХОСТ/admin/`

Вводишь `ADMIN_SECRET` → запросы идут с заголовком `X-Admin-Secret`.

Умеет:

- статистика пользователей и выручки;
- список активных подписок и платежей;
- выдать доступ (`gift` / forever) по числовому `telegram_id`;
- рассылка текста всем или только с активной подпиской;
- тестовое сообщение себе;
- отмена незавершённой рассылки.

Рассылки идут пачками через cron и `src/broadcast/runner.ts` (у Telegram нет «отправить всем одной кнопкой»).

---

## 12. Маршруты Worker (шпаргалка)

Всё объявлено в `src/index.ts`:

| Метод | Путь | Кто вызывает | Защита |
|-------|------|--------------|--------|
| GET | `/health` | Мониторинг | нет |
| POST | `/telegram/webhook` | Telegram | webhook secret |
| POST | `/telegram/configure` | ты (один раз) | webhook secret |
| GET | `/api/plans` | Mini App | нет (публичные цены) |
| POST | `/api/auth` | Mini App | HMAC `initData` |
| PUT | `/api/profile` | Mini App | HMAC `initData` |
| POST | `/api/checkout` | Mini App | HMAC + Platega keys |
| POST | `/api/platega/webhook` | Platega | merchant headers + API re-check |
| GET/POST | `/api/admin/*` | Админка | `X-Admin-Secret` |
| (cron) | каждые 5 мин | Cloudflare | — | напоминания + broadcast drain |
| * | остальное | браузер | статика из `web/` |

---

## 13. Типовые задачи владельца

### Сменить цены / названия тарифов

1. Открой `src/lib/plans.ts` → массив `PLANS`.
2. Поправь `priceRub`, `title`, `perMonthLabel`, `badge`.
3. Синхронизируй `web/legal/offer.html`.
4. `npm run deploy`.

### Сменить контакты поддержки

1. `wrangler.toml` → `SUPPORT_USERNAME`, `SUPPORT_EMAIL`.
2. При необходимости тексты в `src/telegram/api.ts` и legal HTML.
3. Deploy.

### Дать себе вечный доступ

`OWNER_TELEGRAM_IDS = "123456789"` (можно несколько через запятую) → deploy или правка vars в Cloudflare Dashboard. Потом `/start` или открыть Mini App.

### Выдать доступ другу без оплаты

Админка → блок grant → его `telegram_id` → дни или forever.

### Поменять тексты напоминаний

`src/reminders/scheduler.ts` → константы вверху файла → deploy.

### Обновить оферту / политику

`web/legal/offer.html`, `web/legal/privacy.html` → deploy (статика уезжает вместе с Worker).

### Задеплоить изменения

```bash
npm install          # если менялся package.json
npm run typecheck    # опционально, проверка TypeScript
npm run deploy
```

Если менялись файлы в `migrations/`:

```bash
npm run db:migrate:remote
npm run deploy
```

---

## 14. Локальная разработка

```bash
npm install
cp .dev.vars.example .dev.vars
# заполни токен бота и длинные секреты

npx wrangler login
npm run db:migrate:local
npm run dev
```

Откроется примерно `http://127.0.0.1:8787/`.  
Полный auth Mini App **работает только внутри Telegram** (нужен настоящий `initData`). В обычном браузере увидишь paywall — это нормально.

---

## 15. «Сломалось» — что проверить

| Симптом | Куда смотреть |
|---------|----------------|
| Бот молчит | `setWebhook` верный? `TELEGRAM_BOT_TOKEN`? Логи Worker в Cloudflare |
| Webhook 403 | Неверный `TELEGRAM_WEBHOOK_SECRET` / `secret_token` |
| Mini App «нет доступа» без оплаты | Истёк trial? `/api/auth` отвечает? Owner id верный? |
| Оплатил, доступ не открылся | Callback URL в Platega? Секреты Platega? В админке статус платежа `pending`? |
| Админка «нет доступа» | Секрет ≥ 16 символов? Не `change-me` / `admin`? |
| Напоминания не приходят | Cron в `wrangler.toml`? Пользователь прошёл `/reminders`? Не блокировал бота? |
| Рассылка зависла | Админка → broadcasts; cron должен дожимать `drainBroadcasts` |

Логи: Cloudflare Dashboard → Workers → skinlab → Logs.

Проверка живости:

```bash
curl https://ТВОЙ_ХОСТ/health
```

Ожидай `"ok": true`.

---

## 16. Безопасность (коротко для владельца)

Уже сделано в коде:

- подпись Mini App (`initData`) проверяется на сервере;
- чужой `telegram_id` в теле запроса **нельзя** подставить — берётся только из проверенной подписи;
- admin без длинного секрета не пускает;
- Platega без ключей и без подтверждения API не активирует оплату;
- в админке имена пользователей экранируются (защита от вредоносного имени в Telegram).

Твои обязанности:

- длинные случайные секреты (`openssl rand -hex 32`);
- не светить `ADMIN_SECRET` в публичных чатах и скриншотах;
- после передачи продукта — **сменить все секреты** (см. HANDOFF.md);
- не коммитить `.dev.vars`.

---

## 17. Что трогать осторожно / не трогать

| Можно смело | Осторожно | Лучше не трогать без разработчика |
|-------------|-----------|-------------------------------------|
| `src/lib/plans.ts` (цены) | `src/telegram/api.ts` (тексты) | `src/db/queries.ts` |
| `web/legal/*` | `web/shared/content.js` | `src/lib/telegram-auth.ts` |
| `SUPPORT_*`, `OWNER_*` в vars | `wrangler.toml` database_id | логика webhook Platega |
| Тексты напоминаний | `migrations/*` (только добавлять новые файлы) | удалять таблицы руками |
| Иконки в `web/assets` | CSS темы | папки `server/`, `public/` (legacy) |

---

## 18. Комментарии в коде и README — да, они есть

В этом репозитории уже заложено под передачу:

1. **README.md** — что за продукт, структура, локальный запуск, деплой, секреты, тарифы, ссылки на handoff.
2. **Комментарии в `src/`** — у входных файлов (`index.ts`, `plans.ts`, `platega/client.ts`, `telegram-auth.ts`, reminders, broadcast, admin) в шапке или у функций написано **зачем** кусок нужен, на русском/английском техническом языке.
3. **HANDOFF.md** / **SHIP.md** — чеклисты передачи и готовности.
4. **Этот PROJECT_GUIDE.md** — « bicблия» для человека, который читает код, но не пишет его каждый день.

Если Cursor станет недоступен: достаточно Git-репозитория + Cloudflare-аккаунта + этого файла. Новый разработчик или ты сам начинаете с разделов **2 → 3 → 13**.

---

## 19. Чеклист «я могу жить без Cursor»

- [ ] Репозиторий скачан / запушен на GitHub/GitLab (свой remote)
- [ ] Есть доступ в Cloudflare (Workers + D1)
- [ ] Секреты записаны в менеджер паролей (не только в чате)
- [ ] Знаешь URL прода и Callback Platega
- [ ] Прочитал этот файл + README + HANDOFF
- [ ] Умеешь выполнить `npm run deploy` с машины с Node 20+
- [ ] Сделал хотя бы один `d1 export` бэкап

---

*Документ описывает Cloudflare-стек SkinLab. Legacy Selectel (`server/`, `public/`) в прод-пути не участвует.*
