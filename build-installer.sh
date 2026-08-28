#!/usr/bin/env bash
# =============================================================================
# DayFlow — сборка установщика для Windows (NSIS / Modern UI 2)
#
# Результат: release/DayFlow-Setup-1.0.0.exe  (запустить и установить)
#
# Требования:
#   1. Приложение собрано: release/DayFlow/  (запустите ./build.sh)
#   2. Компилятор NSIS `makensis` для Linux + комплект NSIS (stubs/Include/Plugins/MUI2).
#      Удобнее всего взять из npm:  npm pack @nsis-u/makensis  (содержит весь NSIS,
#      кроме Linux-бинарника makensis, который собирается из исходников).
#      Укажите путь через переменную окружения NSISDIR (папка, где лежат Stubs/ Include/).
# =============================================================================
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="$APP_DIR/release"

MAKENSIS="${MAKENSIS:-makensis}"

# --- 1. Проверяем приложение ---
if [ ! -f "$OUT/DayFlow/DayFlow.exe" ]; then
  echo "▶ Папки release/DayFlow нет — сначала запустите ./build.sh" >&2
  exit 1
fi

# --- 2. Готовим staging ---
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/app" "$STAGE/assets"
cp -r "$OUT/DayFlow/." "$STAGE/app/"
cp "$APP_DIR/installer/assets/header.bmp" "$STAGE/assets/"
cp "$APP_DIR/installer/assets/welcome.bmp" "$STAGE/assets/"
cp "$APP_DIR/assets/icon.ico" "$STAGE/assets/"

# --- 3. Компилируем установщик ---
echo "▶ Компиляция установщика…"
( cd "$STAGE" && "$MAKENSIS" "$APP_DIR/installer/DayFlow-Setup.nsi" )

cp "$STAGE/DayFlow-Setup-1.0.0.exe" "$OUT/"

echo ""
echo "═══════════════════════════════════════════"
echo "✔ Готово: $OUT/DayFlow-Setup-1.0.0.exe"
echo "═══════════════════════════════════════════"
du -sh "$OUT/DayFlow-Setup-1.0.0.exe"
