# SkinLab

PWA-справочник по активным ингредиентам в уходе за кожей. SkinLab показывает
совместимость активов, помогает собрать персональную рутину и раскладывает уход
по дням без конфликтующих сочетаний.

Интерфейс основан на дизайне Botanica; альтернативные макеты удалены.

## Запуск приложения

```bash
./start.sh
# или
python3 -m http.server 4173 --directory public --bind 127.0.0.1
```

Откройте <http://127.0.0.1:4173>. Рабочее приложение находится в
`public/m1-botanica/`, а корень сайта сразу перенаправляет в него.

Прод: <https://mdakaev.github.io/skinlab/>

## Возможности

- справочник активов с противопоказаниями, способом применения и источниками;
- проверка хороших, нейтральных, осторожных и запрещённых сочетаний;
- персональный подбор по типу кожи, задачам и беременности;
- недельное расписание без конфликтующих активов;
- локальный профиль и светлая/тёмная тема;
- установка как PWA и офлайн-режим.

Данные профиля хранятся только в `localStorage`.

## Лицензия (разовая покупка)

Полный **Идеал** и недельный план в **Мой уход** открываются разовой лицензией.
Справочник сочетаний и активы бесплатны.

- Оферта: [`public/legal/offer.html`](public/legal/offer.html) — явно без гарантии вечного хостинга
- API: `GET /api/license/offer`, `POST /api/license/checkout`, `POST /api/license/redeem`
- Dev без ЮKassa: `SKINLAB_DEV_LICENSES=1` (см. `.env.example`)
- Live: задайте `YOOKASSA_SHOP_ID` и `YOOKASSA_SECRET_KEY`

Локально: поднимите API (`npm start`) рядом с `./start.sh`, иначе кнопка «Купить» не достучится до сервера.

## Telegram Mini App

SkinLab открывается и как обычный Web/PWA, и как Telegram Mini App (тот же Botanica UI).

- План: [`docs/telegram-mini-app-plan.md`](docs/telegram-mini-app-plan.md)
- BotFather: [`docs/telegram-setup.md`](docs/telegram-setup.md)
- Разработка: [`docs/telegram-development.md`](docs/telegram-development.md)
- Монетизация: [`docs/telegram-monetization.md`](docs/telegram-monetization.md)

В `.env`: `TELEGRAM_BOT_TOKEN` (только backend), `TELEGRAM_WEBAPP_URL`.

## Структура

```text
public/
  index.html             # вход в SkinLab
  m1-botanica/           # единственный интерфейс приложения
  shared/                # данные, экспертная логика и общие UI-модули
  assets/                # иконки и шрифты
  manifest.webmanifest   # PWA-манифест
  sw.js                  # офлайн-кэш
server/                  # Fastify API и каталог Open Beauty Facts
tools/                   # служебные скрипты разработки
```

## API каталога

```bash
npm install
npm run seed
npm start
npm run smoke
```

Сервер использует тот же справочник и правила сочетаемости из `public/shared/`,
поэтому фронтенд и API не расходятся в экспертных данных.

Основные эндпоинты:

- `GET /api/health`
- `GET /api/meta`
- `GET /api/actives`
- `GET /api/actives/:id`
- `GET /api/products`
- `GET /api/products/:barcode`
- `POST /api/analyze`

## Деплой на GitHub Pages

```bash
git push origin main
git push origin "$(git subtree split --prefix public main)":refs/heads/gh-pages --force
```

Информация в приложении носит справочный характер и не заменяет консультацию
дерматолога.
