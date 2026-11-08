#!/usr/bin/env bash
# Windows 실행기(win auto)에서: 의존 설치 → 대시보드 빌드 → /cards·/references·API 측정. 사용: win auto -- bash scripts/perf/run-cards.sh <label> [측정 뒤 서버를 더 띄울 초 — Mac 에서 win tunnel 3918 로 Aside 가 연다]
set -euo pipefail
cd "$(dirname "$0")/../.."
label="${1:-run}"
pnpm install --frozen-lockfile --prefer-offline >/dev/null
start=$(date +%s)
pnpm --filter @yunseo/app-dashboard run build > "/tmp/perf-cards-build-$label.log" 2>&1 || { tail -40 "/tmp/perf-cards-build-$label.log"; exit 1; }
echo "build_seconds=$(( $(date +%s) - start ))"
tail -30 "/tmp/perf-cards-build-$label.log"
node scripts/perf/measure-cards.mjs --label "$label" --out "/tmp/perf-cards-$label.json" --serve "${2:-0}"
echo "---JSON-BEGIN---"
cat "/tmp/perf-cards-$label.json"
echo
echo "---JSON-END---"
