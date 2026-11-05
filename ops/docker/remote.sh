#!/usr/bin/env bash
# WSL(Ubuntu, windows-desktop) 안에서 도는 운영 스크립트. Mac 의 ops/docker/ctl.sh 가 stdin 으로 흘려 넣는다:
#   ssh windows-desktop 'wsl.exe -d Ubuntu -- bash -ls -- <명령> [인자]' < ops/docker/remote.sh
# 명령: deploy <sha> | status | stop | start | restart | logs [줄수] | backup-now | import-db <sqlite 파일>
# 코드는 Git 으로만 온다: Mac 이 D:\Services\yunseo-studio\repo.git(deploy 브랜치)에 push → 여기서 git archive 로 그 커밋만 뽑아 빌드.
set -euo pipefail

ROOT="${YUNSEO_WSL_ROOT:-$HOME/Services/yunseo-studio}"   # ext4 — 빌드 입력·현재 커밋 트리(current 심링크)
HUB="${YUNSEO_HUB:-/mnt/d/Services/yunseo-studio/repo.git}"
PROJECT=yunseo-studio
VOLUME=yunseo-studio-data
IMAGE=yunseo-studio:local
URL=http://127.0.0.1:8930

# 비대화 세션(ssh)에서는 ~/.docker/config.json 의 credsStore(desktop.exe)가 "logon session does not exist" 로 실패한다(2026-10-18 기록).
# 쓰는 이미지가 전부 공개 이미지라 자격증명이 필요 없다 — 빈 설정 폴더를 쓴다(compose·buildx 플러그인은 /usr/local/lib/docker/cli-plugins 라 영향 없음).
mkdir -p "$ROOT/.docker-nocreds"
[ -f "$ROOT/.docker-nocreds/config.json" ] || echo '{}' > "$ROOT/.docker-nocreds/config.json"
export DOCKER_CONFIG="$ROOT/.docker-nocreds"

cmd="${1:-status}"
shift || true

compose() { docker compose -p "$PROJECT" -f "$ROOT/current/compose.yaml" "$@"; }

health_of() { docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$1" 2>/dev/null || echo missing; }

# wait_healthy [컨테이너...] — 기본은 둘 다 healthy 가 될 때까지(최대 180초)
wait_healthy() {
  local names=("$@") n i=0 ok
  [ "${#names[@]}" -gt 0 ] || names=(yunseo-dashboard yunseo-worker)
  while [ "$i" -lt 90 ]; do
    ok=1
    for n in "${names[@]}"; do [ "$(health_of "$n")" = healthy ] || ok=0; done
    [ "$ok" = 1 ] && return 0
    sleep 2; i=$((i + 1))
  done
  echo "헬스 대기 시간 초과: dashboard=$(health_of yunseo-dashboard) worker=$(health_of yunseo-worker)" >&2
  return 1
}

status() {
  docker ps -a --filter "label=com.docker.compose.project=$PROJECT" --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
  echo "revision: $(docker exec yunseo-dashboard printenv YUNSEO_REVISION 2>/dev/null || echo -)"
  echo "dashboard: $(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$URL/api/health" || true)  ($URL/api/health)"
  docker exec yunseo-worker node -e "fetch('http://127.0.0.1:8931/health').then(r=>r.text()).then(t=>console.log('worker: '+t.slice(0,160))).catch(e=>console.log('worker: 응답 없음 '+e.message))" 2>/dev/null || echo "worker: 컨테이너 없음/정지"
}

case "$cmd" in
  deploy)
    sha="${1:?deploy <sha>}"
    case "$sha" in *[!0-9a-f]*|"") echo "sha 형식 오류: $sha" >&2; exit 64 ;; esac
    mkdir -p "$ROOT"
    src="$ROOT/src-${sha:0:12}"
    if [ ! -d "$src" ]; then
      mkdir -p "$src.partial"
      git -c safe.directory='*' --git-dir="$HUB" archive "$sha" | tar -x -C "$src.partial"
      mv "$src.partial" "$src"
    fi
    ln -sfn "$src" "$ROOT/current"
    echo "revision ${sha:0:12} -> $src"
    # 되돌리기용으로 직전 이미지를 prev 태그로 남긴다(빌드 실패해도 실행 중 컨테이너는 그대로).
    if docker image inspect "$IMAGE" >/dev/null 2>&1; then docker tag "$IMAGE" yunseo-studio:prev; fi
    export YUNSEO_REVISION="${sha:0:12}"
    compose build
    compose up -d --remove-orphans
    wait_healthy
    status
    # 오래된 커밋 트리 정리 — 최신 3개만 남긴다(현재 current 는 항상 최신).
    ls -1dt "$ROOT"/src-* 2>/dev/null | tail -n +4 | while read -r old; do rm -rf -- "$old"; done
    echo "deploy_done=1"
    ;;
  status) status ;;
  stop) docker stop yunseo-worker yunseo-dashboard; status ;;
  start) docker start yunseo-dashboard; wait_healthy yunseo-dashboard; docker start yunseo-worker; wait_healthy; status ;;
  restart) docker restart yunseo-dashboard yunseo-worker; wait_healthy; status ;;
  logs)
    n="${1:-80}"
    docker logs --tail "$n" yunseo-dashboard 2>&1 | sed 's/^/[dashboard] /'
    docker logs --tail "$n" yunseo-worker 2>&1 | sed 's/^/[worker] /'
    ;;
  backup-now) docker exec -w /app/apps/worker yunseo-worker node --import tsx src/ops-cli.ts backup-now ;;
  import-db)
    # 옛 네이티브 서비스의 DB(opsctl backup-now 사본)를 새 볼륨에 한 번 들여온다. 이미 DB 가 있으면 거부(--force 로만 덮어씀).
    file="${1:?import-db <sqlite 파일> [--force]}"
    [ -f "$file" ] || { echo "파일 없음: $file" >&2; exit 66; }
    docker volume inspect "$VOLUME" >/dev/null 2>&1 || docker volume create "$VOLUME" >/dev/null
    if [ "$(docker run --rm -v "$VOLUME":/data --entrypoint sh "$IMAGE" -c 'test -s /data/studio.db && echo yes || echo no')" = yes ] && [ "${2:-}" != "--force" ]; then
      echo "거부: 볼륨에 이미 studio.db 가 있다(덮어쓰려면 --force)" >&2; exit 73
    fi
    docker run --rm -v "$VOLUME":/data -v "$(dirname "$file")":/in:ro --user node --entrypoint sh "$IMAGE" -c \
      "set -e; cp /in/$(basename "$file") /data/studio.db.importing; mv /data/studio.db.importing /data/studio.db; rm -f /data/studio.db-wal /data/studio.db-shm; node -e \"const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('/data/studio.db');console.log('integrity_check='+d.prepare('PRAGMA integrity_check').get().integrity_check);d.close()\""
    ;;
  *) echo "usage: remote.sh <deploy <sha>|status|stop|start|restart|logs [N]|backup-now|import-db <file>>" >&2; exit 64 ;;
esac
