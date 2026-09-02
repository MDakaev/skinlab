#!/usr/bin/env bash
# Безопасный экспорт SQLite с WAL (запускать на Mac / источнике).
# НЕ копирует файлы на VDS сам — только готовит согласованный snapshot.
#
# Использование:
#   ./deploy/transfer-sqlite.sh
#   ./deploy/transfer-sqlite.sh /path/to/catalog.db
#
# Результат: ./tmp-sqlite-export/catalog.db (+ .sha256)
set -euo pipefail

SRC="${1:-./data/catalog.db}"
OUT_DIR="${OUT_DIR:-./tmp-sqlite-export}"

if [[ ! -f "$SRC" ]]; then
  echo "Нет файла: $SRC" >&2
  exit 1
fi

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "Нужен sqlite3 в PATH" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
EXPORT="$OUT_DIR/catalog.db"
rm -f "$EXPORT" "$EXPORT.sha256"

echo "==> Checkpoint WAL → основной файл (TRUNCATE)"
sqlite3 "$SRC" "PRAGMA wal_checkpoint(TRUNCATE);"

echo "==> Целостность источника"
sqlite3 "$SRC" "PRAGMA integrity_check;" | tee "$OUT_DIR/integrity-src.txt"
grep -qx OK "$OUT_DIR/integrity-src.txt"

echo "==> Online backup в $EXPORT (консистентный снимок)"
sqlite3 "$SRC" ".backup '$EXPORT'"

echo "==> Целостность экспорта"
sqlite3 "$EXPORT" "PRAGMA integrity_check;" | tee "$OUT_DIR/integrity-export.txt"
grep -qx OK "$OUT_DIR/integrity-export.txt"

if command -v shasum >/dev/null 2>&1; then
  shasum -a 256 "$EXPORT" | tee "$EXPORT.sha256"
elif command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$EXPORT" | tee "$EXPORT.sha256"
fi

echo
echo "Готово. Дальше вручную (пример):"
echo "  scp $EXPORT $EXPORT.sha256 skinlab@VDS_HOST:/tmp/"
echo "  # на VDS — см. docs/production-deploy.md § SQLite"
