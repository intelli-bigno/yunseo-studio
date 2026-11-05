#!/usr/bin/env bash
# 컨테이너 안에서 대시보드(next start)와 워커(tsx)를 함께 띄운다. 둘은 운명 공동체다:
# 하나라도 죽으면 나머지도 끄고 비정상 종료한다 → Docker 의 restart 정책(unless-stopped)이 컨테이너째 다시 올린다.
# 왜 한 컨테이너인가: 워커는 루프백에만 열린다(apps/worker/src/config.ts assertSafeHost). 컨테이너를 둘로 나눠
# network_mode: service:dashboard 로 이름공간을 공유하면 대시보드만 재시작될 때 워커가 옛 이름공간에 남아 서로 끊긴다(2026-11-05 실측).
set -u

pids=()
start() { # start <이름> <작업 폴더> <명령...> — 출력 줄마다 [이름] 접두사를 붙여 docker logs 로 보낸다
  local name=$1 dir=$2
  shift 2
  ( cd "$dir" && exec "$@" ) > >(sed -u "s/^/[$name] /") 2>&1 &
  pids+=($!)
}

stop_all() {
  trap - TERM INT
  kill -TERM "${pids[@]}" 2>/dev/null
  wait "${pids[@]}" 2>/dev/null
}

trap 'stop_all; exit 143' TERM INT

start worker /app/apps/worker env HOST=127.0.0.1 PORT=8931 node --import tsx src/main.ts
start dashboard /app/apps/dashboard node node_modules/next/dist/bin/next start -H 0.0.0.0 -p 8930

wait -n "${pids[@]}"
code=$?
echo "[entrypoint] 프로세스 하나가 종료됨(코드 $code) — 나머지를 끄고 컨테이너를 종료해 재시작 정책에 맡긴다"
stop_all
exit $((code == 0 ? 1 : code))
