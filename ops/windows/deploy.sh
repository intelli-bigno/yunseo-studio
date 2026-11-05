#!/usr/bin/env bash
# Mac 에서 실행 — Git 으로만 배포한다(작업트리 복사 금지). Windows git 에는 GitHub 인증이 없어서(2026-11-05 실측: askpass 실패)
# Mac 이 커밋을 Windows 의 bare 저장소(D:\Services\yunseo-studio\repo.git)로 push 하고, Windows 체크아웃이 그 저장소에서 받아 온다.
#
#   ops/windows/deploy.sh [--ref <git ref>] [--first-time] [--dry-run]
#     --ref         배포할 커밋(기본 origin/main). 먼저 git fetch 해 둔다
#     --first-time  bare 저장소·체크아웃을 만들고 install(작업 스케줄러 등록)까지 한다
#     --dry-run     실행할 명령만 출력한다(원격에 아무것도 하지 않는다)
set -euo pipefail

HOST="${YUNSEO_DEPLOY_HOST:-windows-desktop}"
ROOT_POSIX="/d/Services/yunseo-studio"   # Windows ssh 셸은 Git Bash(MSYS) — 경로는 /d/…
ROOT_WIN='D:\Services\yunseo-studio'
REF="origin/main"
FIRST=0
DRY=0

while [ $# -gt 0 ]; do
  case "$1" in
    --ref) REF="$2"; shift 2 ;;
    --first-time) FIRST=1; shift ;;
    --dry-run) DRY=1; shift ;;
    *) echo "unknown option: $1" >&2; exit 64 ;;
  esac
done

SHA="$(git rev-parse --verify "${REF}^{commit}")"
run() {
  printf '+'; printf ' %q' "$@"; printf '\n'
  if [ "$DRY" = 0 ]; then "$@"; fi
}

echo "deploy ${SHA} (${REF}) -> ${HOST}:${ROOT_POSIX}$([ "$DRY" = 1 ] && echo ' [dry-run]')"
if [ "$FIRST" = 1 ]; then
  run ssh "$HOST" "mkdir -p '${ROOT_POSIX}' && { [ -d '${ROOT_POSIX}/repo.git' ] || git init --bare -q '${ROOT_POSIX}/repo.git'; }"
fi
run git push --force "${HOST}:${ROOT_POSIX}/repo.git" "${SHA}:refs/heads/deploy"
if [ "$FIRST" = 1 ]; then
  run ssh "$HOST" "[ -d '${ROOT_POSIX}/app/.git' ] || git clone -q '${ROOT_POSIX}/repo.git' '${ROOT_POSIX}/app'"
fi
MODE="update"
[ "$FIRST" = 1 ] && MODE="install"
run ssh "$HOST" "cd '${ROOT_POSIX}/app' && git fetch -q origin deploy && git checkout -q --detach '${SHA}' && bash ops/windows/remote-update.sh '${ROOT_WIN}' ${MODE}"
