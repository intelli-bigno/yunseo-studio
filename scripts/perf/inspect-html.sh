#!/usr/bin/env bash
# 측정 때 저장한 HTML(/tmp/perf-html-<label>)의 구성을 요약한다. 사용: win auto -- bash scripts/perf/inspect-html.sh <label> <파일명>
set -euo pipefail
f="/tmp/perf-html-${1:?label}/${2:?file}"
echo "bytes=$(wc -c < "$f")"
grep -o '<link[^>]*>' "$f" | cut -c1-220
echo "--- scripts"
grep -o '<script[^>]*src="[^"]*"[^>]*>' "$f" | cut -c1-200
echo "--- inline script heads"
node -e '
const h=require("fs").readFileSync(process.argv[1],"utf8");
let i=0; for (const m of h.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)) { i++; console.log(i, m[1].length, JSON.stringify(m[1].slice(0,160))); }
' "$f"
