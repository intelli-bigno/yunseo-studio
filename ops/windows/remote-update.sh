#!/usr/bin/env bash
# Windows(Git Bash)에서 deploy.sh 가 부른다 — 체크아웃이 이미 새 커밋으로 바뀐 뒤에 돈다.
#   bash ops/windows/remote-update.sh <ROOT_WIN> <install|update>
# 순서: 서비스 중지 → 의존 설치(잠금 파일 그대로) → 대시보드 빌드 → install(첫 배포) 또는 start → 헬스 확인.
# 중지를 먼저 하는 이유: 실행 중인 next 가 .next·node_modules 파일을 쥐고 있으면 Windows 에서 덮어쓰기가 실패한다.
set -euo pipefail
ROOT_WIN="$1"
MODE="${2:-update}"
ctl() { node --import tsx ops/windows/opsctl.ts "$@" --root "$ROOT_WIN"; }

echo "revision $(git rev-parse --short=12 HEAD) mode ${MODE}"
if [ "$MODE" = "update" ]; then ctl stop; fi
pnpm install --frozen-lockfile
pnpm --filter @yunseo/app-dashboard run build
if [ "$MODE" = "install" ]; then ctl preflight && ctl install; else ctl start; fi
ctl status
echo "deploy_done=1"
