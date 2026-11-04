#!/usr/bin/env bash
# 안별 HTML → render/<안>-home.png · <안>-editor.png (1600×1000, 2배 = 3200×2000). 로컬 파일만 렌더한다(외부 URL 접근 없음).
# 화면마다 임시 사본(.tmp-*.html)을 만들어 해당 section 만 보이게 캡처한 뒤 사본을 지운다.
# 사용: bash docs/design/directions-v2/render.sh [a-atelier-noir ...]   (Chrome 경로는 CHROME 환경변수)
set -euo pipefail
cd "$(dirname "$0")"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
mkdir -p render
names=("$@"); [ ${#names[@]} -eq 0 ] && names=(a-atelier-noir b-club-green c-graphite-cockpit)
for name in "${names[@]}"; do
  for s in home editor; do
    tmp=".tmp-$name-$s.html"
    css="<style>.screen:not(#$s){display:none!important} #$s{margin:0!important}</style>"
    sed "s|</head>|$css</head>|" "$name.html" > "$tmp"
    "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 \
      --window-size=1600,1000 --screenshot="$PWD/render/${name%%-*}-$s.png" "file://$PWD/$tmp" >/dev/null 2>&1
    rm -f "$tmp"
  done
done
ls -la render/
