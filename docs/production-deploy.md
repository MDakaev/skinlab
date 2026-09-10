# SkinLab — production на Ubuntu 24.04 VDS

Один VDS: Nginx (статика `public/` + TLS) → Fastify на `127.0.0.1:8787`.
Telegram — **webhook**, не polling. SQLite остаётся на диске.

Не коммитьте `.env`. Не открывайте порт `8787` в UFW.

## Предпосылки

- Ubuntu 24.04, Node ≥ 20 (у вас 22.x OK), npm, nginx, UFW 22/80/443
- Репозиторий в `~/skinlab`, `npm install` уже выполнен
- DNS A-запись на VDS (для TLS / Telegram HTTPS)

## 1. Файлы окружения

```bash
cd ~/skinlab
cp .env.example .env
chmod 600 .env
nano .env
```

Обязательно задайте (значения — только у вас, не в Git):

| Переменная | Назначение |
|------------|------------|
| `NODE_ENV=production` | отключает `npm run bot` (polling) |
| `HOST=127.0.0.1` | API только localhost |
| `PORT=8787` | внутренний порт |
| `SKINLAB_PUBLIC_URL` | `https://ваш-домен` без `/` |
| `SKINLAB_DB` | `/var/lib/skinlab/catalog.db` |
| `TELEGRAM_BOT_TOKEN` | BotFather |
| `TELEGRAM_WEBAPP_URL` | обычно = `SKINLAB_PUBLIC_URL` |
| `YOOKASSA_SHOP_ID` / `YOOKASSA_SECRET_KEY` | live-оплата |

**Не задавайте** `SKINLAB_DEV_LICENSES=1` на production.

## 2. Каталог для SQLite

```bash
sudo mkdir -p /var/lib/skinlab
sudo chown skinlab:skinlab /var/lib/skinlab
sudo chmod 750 /var/lib/skinlab
```

Перенос базы с Mac — **отдельный раздел ниже**. Пока БД нет, при первом старте API создаст пустую схему (каталог продуктов будет 0) — это не уничтожает уже лежащий файл, если вы его положили заранее.

## 3. systemd

```bash
sudo cp ~/skinlab/deploy/skinlab.service /etc/systemd/system/skinlab.service
# при необходимости поправьте пути User=/WorkingDirectory=/ExecStart=
sudo systemctl daemon-reload
sudo systemctl enable --now skinlab
sudo systemctl status skinlab
curl -sS http://127.0.0.1:8787/health
curl -sS http://127.0.0.1:8787/api/health
```

## 4. Nginx

```bash
sudo cp ~/skinlab/deploy/nginx-skinlab.conf /etc/nginx/sites-available/skinlab
sudo nano /etc/nginx/sites-available/skinlab   # замените example.com и пути
sudo ln -sf /etc/nginx/sites-available/skinlab /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default    # если мешает
sudo nginx -t
sudo systemctl reload nginx
```

TLS (когда DNS уже указывает на VDS):

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d ваш-домен
```

Проверка same-origin:

```bash
curl -sS https://ваш-домен/health
curl -sS https://ваш-домен/api/health
```

UFW: **не** открывайте `8787`.

## 5. Telegram webhook (не polling)

1. Убедитесь, что `npm run bot` **не** запущен и не в cron.
2. Секрет webhook (на VDS, с загруженным `.env`):

```bash
cd ~/skinlab
node -e "import('./server/src/loadEnv.js'); import { webhookSecretHint } from './server/src/telegram/auth.js'; console.log(webhookSecretHint());"
```

3. Установка webhook (подставьте токен и секрет сами).
   Если с VDS `api.telegram.org:443` недоступен — выполните `setWebhook` **с Mac** или через прокси (см. ниже):

```bash
curl -sS "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -d "url=https://ваш-домен/api/telegram/webhook?secret=ВАШ_SECRET" \
  -d "allowed_updates=[\"message\"]"
```

4. Menu Button / описание:

```bash
cd ~/skinlab && npm run bot:configure
```

Проверка: `curl -sS "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"`

### 5.1 Прокси только для Telegram (РФ / блокировка Bot API)

Нужен, если с VDS ping до IP Telegram есть, а **HTTPS :443 к `api.telegram.org` — timeout**.
Прокси используется **только** исходящими вызовами Bot API (`sendMessage`, `setMyCommands`, …). ЮKassa и остальной трафик идут напрямую.

1. Поднимите SOCKS5 вне РФ (пример: SSH-туннель с Selectel на зарубежный VPS):

```bash
# на VDS Selectel — держать постоянно (systemd unit / autossh)
ssh -fN -o ServerAliveInterval=60 -o ExitOnForwardFailure=yes \
  -D 127.0.0.1:1080 user@YOUR_EU_VPS
```

2. Проверка:

```bash
curl -x socks5h://127.0.0.1:1080 -I --max-time 15 https://api.telegram.org
```

3. В `/etc/skinlab.env` (или `.env`):

```bash
TELEGRAM_PROXY_URL=socks5://127.0.0.1:1080
```

Поддерживаются `http://`, `https://`, `socks5://` (с логином: `socks5://user:pass@host:port`).

4. `sudo systemctl restart skinlab` и снова `npm run bot:configure` (уже через прокси).

## 6. ЮKassa

В кабинете ЮKassa укажите HTTP-уведомления:

`https://ваш-домен/api/license/webhook/yookassa`

Return URL задаёт клиент с `location.origin` (same-origin). Fallback на сервере — `SKINLAB_PUBLIC_URL`.

## 7. Обновление кода

```bash
cd ~/skinlab
git pull
npm ci          # предпочтительно; или npm install
sudo systemctl restart skinlab
sudo systemctl reload nginx   # если меняли conf
curl -sS http://127.0.0.1:8787/health
```

## 8. Backup SQLite

Остановите запись или используйте `.backup` (предпочтительно без простоя дольше секунд):

```bash
stamp=$(date +%Y%m%d-%H%M%S)
mkdir -p ~/backups
sqlite3 /var/lib/skinlab/catalog.db ".backup '$HOME/backups/catalog-$stamp.db'"
sqlite3 "$HOME/backups/catalog-$stamp.db" "PRAGMA integrity_check;"
```

Храните копии вне VDS (S3 / другой хост).

## 9. Безопасный перенос catalog.db с Mac → VDS

**Не** копируйте одновременно `catalog.db` + `-wal` + `-shm` «как есть» без checkpoint — легко получить битую БД.

### На Mac (репозиторий)

1. Остановите локальный `npm start`, если он пишет в `./data/catalog.db`.
2. Экспорт:

```bash
chmod +x deploy/transfer-sqlite.sh
./deploy/transfer-sqlite.sh ./data/catalog.db
```

Скрипт делает `wal_checkpoint(TRUNCATE)`, `integrity_check`, `.backup` → `tmp-sqlite-export/catalog.db`.

3. Копирование:

```bash
scp tmp-sqlite-export/catalog.db tmp-sqlite-export/catalog.db.sha256 \
  skinlab@VDS_HOST:/tmp/
```

### На VDS

```bash
sudo systemctl stop skinlab   # если уже запущен

# Не затирайте существующую prod-базу без бэкапа:
if [[ -f /var/lib/skinlab/catalog.db ]]; then
  stamp=$(date +%Y%m%d-%H%M%S)
  sqlite3 /var/lib/skinlab/catalog.db ".backup '$HOME/backups/catalog-before-import-$stamp.db'"
fi

install -m 640 -o skinlab -g skinlab /tmp/catalog.db /var/lib/skinlab/catalog.db
# WAL/SHM со старого Mac НЕ копировать рядом
rm -f /var/lib/skinlab/catalog.db-wal /var/lib/skinlab/catalog.db-shm

sqlite3 /var/lib/skinlab/catalog.db "PRAGMA integrity_check;"
# ожидается: OK

# сверить checksum при наличии
# sha256sum -c /tmp/catalog.db.sha256   # путь в файле может отличаться — сверьте хэш вручную

# В .env: SKINLAB_DB=/var/lib/skinlab/catalog.db
sudo systemctl start skinlab
curl -sS http://127.0.0.1:8787/api/health
```

## 10. Health / smoke

```bash
curl -sS https://ваш-домен/health
curl -sS https://ваш-домен/api/health
curl -sS https://ваш-домен/api/license/offer
# Mini App в Telegram + вкладка профиля / покупка
```

## Замечания по безопасности

- `/api/license/dev-issue` отвечает 404, если `SKINLAB_DEV_LICENSES` не включён
- Telegram webhook **требует** `?secret=`
- Секреты только в `.env` / EnvironmentFile, не во frontend
- Checkout/redeem: простой rate limit на процесс
- CORS `origin: true` — при same-origin через Nginx основной трафик same-site; при необходимости ужесточите позже
