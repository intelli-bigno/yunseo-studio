#!/usr/bin/env bash
# Windows 실행기(win auto)에서: 의존 설치 → 대시보드 빌드 → 측정. 사용: win auto -- bash scripts/perf/run.sh <label>
set -euo pipefail
cd "$(dirname "$0")/../.."
label="${1:-run}"
pnpm install --frozen-lockfile --prefer-offline >/dev/null
start=$(date +%s)
pnpm --filter @yunseo/app-dashboard run build > "/tmp/perf-build-$label.log" 2>&1 || { tail -40 "/tmp/perf-build-$label.log"; exit 1; }
echo "build_seconds=$(( $(date +%s) - start ))"
tail -25 "/tmp/perf-build-$label.log"
node scripts/perf/measure.mjs --label "$label" --out "/tmp/perf-$label.json" --dump "/tmp/perf-html-$label"
echo "---JSON-BEGIN---"
cat "/tmp/perf-$label.json"
echo
echo "---JSON-END---"
