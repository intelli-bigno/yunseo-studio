#!/usr/bin/env bash
# Mac 에서 실행 — Windows(WSL Docker)의 yunseo-studio 상주 서비스를 조작한다. Mac 에서 docker 를 실행하지 않는다.
#
#   ops/docker/ctl.sh deploy [--ref <git ref>] [--dry-run]   기본 origin/main. 커밋을 Windows hub(repo.git)에 push → WSL 에서 빌드·기동·헬스
#   ops/docker/ctl.sh status | stop | start | restart | logs [줄수] | backup-now
#   ops/docker/ctl.sh import-db <WSL 경로의 sqlite 파일> [--force]
#
# 코드는 Git 으로만 옮긴다(작업트리 복사 금지). Windows git 에는 GitHub 인증이 없어서 Mac 이 hub 로 push 한다(ops/windows/deploy.sh 와 같은 hub).
set -euo pipefail

HOST="${YUNSEO_DEPLOY_HOST:-windows-desktop}"
HUB_POSIX="/d/Services/yunseo-studio/repo.git"   # Windows ssh 셸은 Git Bash(MSYS) — 경로는 /d/…
HERE="$(cd "$(dirname "$0")" && pwd -P)"
REMOTE_SH="$HERE/remote.sh"

cmd="${1:-status}"
shift || true

run_remote() {   # stdin 으로 remote.sh 를 흘려 보낸다 — 인라인 따옴표/$ 변환을 피한다
  local args=""
  for a in "$@"; do args+=" $(printf '%q' "$a")"; done
  # MSYS_NO_PATHCONV: Git Bash 가 /home/… 같은 인자를 Windows 경로로 바꾸지 못하게 한다
  ssh "$HOST" "MSYS_NO_PATHCONV=1 wsl.exe -d Ubuntu -- bash -ls --${args}" < "$REMOTE_SH"
}

case "$cmd" in
  deploy)
    REF="origin/main"; DRY=0
    while [ $# -gt 0 ]; do
      case "$1" in
        --ref) REF="$2"; shift 2 ;;
        --dry-run) DRY=1; shift ;;
        *) echo "unknown option: $1" >&2; exit 64 ;;
      esac
    done
    SHA="$(git rev-parse --verify "${REF}^{commit}")"
    echo "deploy ${SHA} (${REF}) -> ${HOST}:WSL docker$([ "$DRY" = 1 ] && echo ' [dry-run]')"
    if [ "$DRY" = 1 ]; then
      echo "+ git push --force ${HOST}:${HUB_POSIX} ${SHA}:refs/heads/deploy"
      echo "+ ssh ${HOST} wsl.exe -d Ubuntu -- bash -ls -- deploy ${SHA} < ops/docker/remote.sh"
      exit 0
    fi
    ssh "$HOST" "[ -d '${HUB_POSIX}' ] || git init --bare -q '${HUB_POSIX}'"
    git push --force "${HOST}:${HUB_POSIX}" "${SHA}:refs/heads/deploy"
    run_remote deploy "$SHA"
    ;;
  status|stop|start|restart|logs|backup-now|import-db) run_remote "$cmd" "$@" ;;
  *) echo "usage: ctl.sh <deploy|status|stop|start|restart|logs|backup-now|import-db>" >&2; exit 64 ;;
esac
