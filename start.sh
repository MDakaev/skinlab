#!/usr/bin/env bash
# Локальный запуск прототипа SkinLab.
# Открывает статический сервер на http://127.0.0.1:4173
set -e
cd "$(dirname "$0")"
PORT="${1:-4173}"
echo "SkinLab → http://127.0.0.1:${PORT}"
echo "Макеты: /m1-botanica  /m2-editorial  /m3-noir  /m4-bubble"
exec python3 -m http.server "$PORT" --directory public --bind 127.0.0.1
