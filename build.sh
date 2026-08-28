#!/usr/bin/env bash
# =============================================================================
# DayFlow — сборка готового Windows-приложения (NW.js)
#
# Результат: release/DayFlow-Windows-x64.zip  (распаковать и запустить DayFlow.exe)
#
# Требования: npm (для скачивания рантайма NW.js из npm-реестра), zip, tar.
# =============================================================================
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="$APP_DIR/release"

# --- 1. Получаем рантайм NW.js win-x64 (либо из переданного tgz, либо из npm) ---
NW_TGZ="${1:-}"
if [ -z "$NW_TGZ" ]; then
  NW_TGZ="$(ls "$APP_DIR"/nwjs-binaries-win-x64-*.tgz 2>/dev/null | head -1 || true)"
fi
if [ -z "$NW_TGZ" ] || [ ! -f "$NW_TGZ" ]; then
  echo "▶ Скачиваю рантайм NW.js из npm…"
  (cd /tmp && npm pack @nwjs-binaries/win-x64 --silent)
  NW_TGZ="$(ls -t /tmp/nwjs-binaries-win-x64-*.tgz | head -1)"
fi
echo "▶ Рантайм: $NW_TGZ"

# --- 2. Распаковываем рантайм ---
rm -rf "$OUT"
mkdir -p "$OUT/runtime"
tar -xzf "$NW_TGZ" -C "$OUT/runtime"
SRC="$(find "$OUT/runtime" -name nw.exe -print -quit | xargs dirname)"
echo "▶ Рантайм распакован: $SRC"

# --- 3. Собираем папку приложения ---
APP="$OUT/DayFlow"
mkdir -p "$APP"

# Обязательные файлы рантайма (без SDK-отладочных chromedriver/nwjc/credits)
for f in nw.exe nw.dll node.dll icudtl.dat d3dcompiler_47.dll ffmpeg.dll \
         libEGL.dll libGLESv2.dll nw_elf.dll resources.pak nw_100_percent.pak \
         nw_200_percent.pak v8_context_snapshot.bin vk_swiftshader.dll \
         vk_swiftshader_icd.json vulkan-1.dll notification_helper.exe; do
  [ -f "$SRC/$f" ] && cp "$SRC/$f" "$APP/"
done

# Локали (только нужные)
mkdir -p "$APP/locales"
for loc in ru.pak en-US.pak; do
  [ -f "$SRC/locales/$loc" ] && cp "$SRC/locales/$loc" "$APP/locales/"
done

# Переименовываем запускающий файл
mv "$APP/nw.exe" "$APP/DayFlow.exe"

# --- 4. Кладём код приложения в package.nw ---
mkdir -p "$APP/package.nw"
cp -r "$APP_DIR/renderer" "$APP/package.nw/"
cp -r "$APP_DIR/vendor"   "$APP/package.nw/"
cp -r "$APP_DIR/assets"   "$APP/package.nw/"
cp "$APP_DIR/package.json" "$APP/package.nw/"

# --- 5. Архив для раздачи ---
(cd "$OUT" && zip -r -q "DayFlow-Windows-x64.zip" DayFlow)

echo ""
echo "═══════════════════════════════════════════"
echo "✔ Готово: $OUT/DayFlow-Windows-x64.zip"
echo "  Распакуйте архив и запустите DayFlow.exe"
echo "═══════════════════════════════════════════"
du -sh "$OUT/DayFlow-Windows-x64.zip"
