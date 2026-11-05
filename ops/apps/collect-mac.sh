#!/usr/bin/env bash
# 설치 앱 수집(macOS) — /Applications·/System/Applications 의 .app 이름과 실제 아이콘(.icns → PNG 64px)을 apps.json + icons/ 로 쓴다.
# 읽기 전용 수집(서버 실행 아님). 사용: bash ops/apps/collect-mac.sh <출력 폴더> [기기 이름]
set -euo pipefail
out=${1:?출력 폴더}; machine=${2:-$(hostname -s | tr 'A-Z' 'a-z' | tr -c 'a-z0-9-\n' '-')}
mkdir -p "$out/icons"
json="$out/apps.json"; i=0; first=1
{
  printf '{"machine":"%s","collectedAt":"%s","apps":[' "$machine" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  for app in /Applications/*.app /System/Applications/*.app; do
    [ -d "$app" ] || continue
    i=$((i + 1)); slug=$(printf 'm%04d' "$i"); name=$(basename "$app" .app); icon=null
    plist="$app/Contents/Info.plist"
    f=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIconFile' "$plist" 2>/dev/null || true)
    [ -n "$f" ] && { case "$f" in *.icns) ;; *) f="$f.icns" ;; esac; }
    src="$app/Contents/Resources/$f"
    if [ -n "$f" ] && [ -f "$src" ] && sips -s format png -Z 64 "$src" --out "$out/icons/$slug.png" >/dev/null 2>&1; then icon="\"$slug.png\""; fi
    esc=$(printf '%s' "$name" | sed 's/\\/\\\\/g; s/"/\\"/g')
    [ $first -eq 1 ] && first=0 || printf ','
    printf '{"name":"%s","icon":%s}' "$esc" "$icon"
  done
  printf ']}\n'
} > "$json"
echo "apps=$i → $json"
