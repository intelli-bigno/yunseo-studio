#!/usr/bin/env bash
# 대시보드를 켜고 샘플 덱을 한 번 만든다. 주소는 이 컴퓨터 안(127.0.0.1)에만 열린다 — 로그인이 없으므로 밖으로 열지 않는다.
#   bash scripts/start.sh             앞에서 실행 (Ctrl+C 로 끝)
#   bash scripts/start.sh --detach    뒤에서 실행하고 바로 돌아온다 (Claude Code 가 쓸 때). 로그 .data/dashboard.log
#   bash scripts/start.sh --stop      뒤에서 돌고 있는 것을 끈다
#   bash scripts/start.sh --no-sample 샘플 덱을 만들지 않는다
# 설정은 .env (없으면 기본값). 먼저 bash scripts/setup.sh 를 한 번 돌려야 한다.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"

DETACH=0 STOP=0 SAMPLE=1
for a in "$@"; do
  case "$a" in
    --detach) DETACH=1 ;;
    --stop) STOP=1 ;;
    --no-sample) SAMPLE=0 ;;
    *) echo "모르는 옵션: $a (맨 위 주석 참고)"; exit 2 ;;
  esac
done

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi
PORT="${PORT:-8930}"
export STUDIO_DB="${STUDIO_DB:-$ROOT/.data/studio.db}"
export STUDIO_WORK_DIR="${STUDIO_WORK_DIR:-$ROOT/.data/work}"
export STUDIO_CLOCK="${STUDIO_CLOCK:-system}"
export STUDIO_URL="${STUDIO_URL:-http://127.0.0.1:$PORT}"
export NEXT_TELEMETRY_DISABLED=1
# .env 의 빈 값("FFMPEG_PATH=")은 기본값을 덮지 않게 지운다
for v in STUDIO_OPERATOR FFMPEG_PATH FFPROBE_PATH; do [ -n "${!v:-}" ] || unset "$v"; done
mkdir -p "$(dirname "$STUDIO_DB")" "$STUDIO_WORK_DIR"

PID_FILE="$ROOT/.data/dashboard.pid"
LOG_FILE="$ROOT/.data/dashboard.log"
healthy() { node -e "fetch('http://127.0.0.1:$PORT/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))" 2>/dev/null; }

if [ "$STOP" = 1 ]; then
  if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    kill "$(cat "$PID_FILE")" && rm -f "$PID_FILE" && echo "끝냈다."
  else
    rm -f "$PID_FILE"; echo "뒤에서 도는 대시보드가 없다."
  fi
  exit 0
fi

if [ ! -d node_modules ] || [ ! -e apps/dashboard/node_modules/next ]; then
  echo "의존성이 없다 — 먼저 bash scripts/setup.sh"; exit 1
fi

# 이미 떠 있으면 새로 띄우지 않고 샘플만 확인한다
if healthy; then
  echo "이미 켜져 있다: $STUDIO_URL"
  [ "$SAMPLE" = 1 ] && node scripts/studio-cards.mjs sample
  exit 0
fi

seed_when_ready() {
  for _ in $(seq 1 180); do
    if healthy; then
      echo "준비됐다: $STUDIO_URL/cards"
      [ "$SAMPLE" = 1 ] && node scripts/studio-cards.mjs sample
      return 0
    fi
    sleep 1
  done
  echo "180초 안에 켜지지 않았다. 로그: $LOG_FILE"; return 1
}

cd apps/dashboard
# next dev — 코드를 고치면 바로 반영된다. 첫 화면은 컴파일 때문에 10~30초 걸릴 수 있다. 루프백에만 바인드한다.
# --webpack: 이 저장소의 빌드(next build --webpack)와 같은 번들러다. Next 16 기본(Turbopack)은 스레드를 많이 만들어 제한이 있는 환경에서 EAGAIN 으로 죽은 적이 있다.
if [ "$DETACH" = 1 ]; then
  nohup node node_modules/next/dist/bin/next dev --webpack -H 127.0.0.1 -p "$PORT" >"$LOG_FILE" 2>&1 &
  echo $! >"$PID_FILE"
  cd "$ROOT"
  seed_when_ready || { tail -n 20 "$LOG_FILE" || true; exit 1; }
  echo "끄려면: bash scripts/start.sh --stop"
else
  ( cd "$ROOT" && seed_when_ready ) &
  exec node node_modules/next/dist/bin/next dev --webpack -H 127.0.0.1 -p "$PORT"
fi
