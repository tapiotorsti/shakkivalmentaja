#!/bin/sh
# Kuvaa tools/social-preview.html headless-Chromella tiedostoksi docs/social-preview.png (1280×640).
# Käyttö: sh tools/make_social_preview.sh   (Chromen polun voi antaa CHROME_PATH-muuttujalla)
set -e
cd "$(dirname "$0")/.."
CHROME="${CHROME_PATH:-$(command -v google-chrome || command -v chromium || echo "/c/Program Files/Google/Chrome/Application/chrome.exe")}"
OUT="$(pwd)/docs/social-preview.png"
PAGE="file://$(pwd)/tools/social-preview.html"
if command -v cygpath >/dev/null 2>&1; then OUT="$(cygpath -w "$OUT")"; PAGE="file:///$(cygpath -m "$(pwd)")/tools/social-preview.html"; fi
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --window-size=1280,640 --virtual-time-budget=6000 --screenshot="$OUT" "$PAGE"
