#!/usr/bin/env bash
# 예시 정본 3종(이전·이후·연구)을 카드 세트로 렌더한다 — 결과 확인·PR 첨부용.
# 사용: bash scripts/render-examples.sh <출력 폴더>   (Windows 실행기: win auto -- bash scripts/render-examples.sh /mnt/c/Users/…/폴더)
set -euo pipefail
out="${1:?출력 폴더가 필요하다}"
cd "$(dirname "$0")/.."
pnpm run render content/examples/pre-issue/us-midterms-three-repricings.yaml --out "$out/pre-issue" --backgrounds docs/design/card-reference/v2/bg
pnpm run render content/examples/post-issue/us-midterms-what-changed.yaml --out "$out/post-issue"
pnpm run render content/examples/research/baseline-worksheet.yaml --out "$out/research"
pnpm run render content/examples/research/baseline-worksheet.ko.yaml --out "$out/research-ko"
