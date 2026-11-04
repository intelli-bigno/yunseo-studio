#!/usr/bin/env bash
# cards-v2.html → render/v2-01.png … v2-08.png (1080×1350). 로컬 파일만 렌더한다(외부 URL 접근 없음).
# 카드마다 임시 사본(.tmp-card-N.html)을 만들어 해당 카드만 보이게 하고, Chrome headless 로 캡처한 뒤 사본을 지운다.
# 사용: bash docs/design/card-reference/v2/render.sh   (Chrome 경로는 CHROME 환경변수로 바꿀 수 있다)
set -euo pipefail
cd "$(dirname "$0")"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
mkdir -p render
for n in 1 2 3 4 5 6 7 8; do
  tmp=".tmp-card-$n.html"
  css="<style>.card{display:none!important} #c$n{display:block!important;margin:0!important} body{background:#000!important} body::after{display:none!important}</style>"
  sed "s|</head>|$css</head>|" cards-v2.html > "$tmp"
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --window-size=1080,1350 --screenshot="$PWD/render/v2-0$n.png" "file://$PWD/$tmp" >/dev/null 2>&1
  rm -f "$tmp"
done
ls -la render/v2-0*.png
