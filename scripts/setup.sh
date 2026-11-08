#!/usr/bin/env bash
# YS-Studio 첫 설치 — 필요한 도구를 확인하고, 의존성을 받고, .env 를 만든다. 여러 번 돌려도 된다.
#   bash scripts/setup.sh           확인 + pnpm install + .env 만들기
#   bash scripts/setup.sh --check   확인만 한다(아무것도 설치하지 않음)
# 필수(없으면 멈춤): Node 22.13 이상, pnpm.  선택(없으면 경고): ffmpeg(릴스), codex(배경 이미지 생성), Docker(상시 실행).
# 다음 단계: bash scripts/start.sh   (자세한 설명: docs/handoff/README.md)
set -euo pipefail
cd "$(dirname "$0")/.."

CHECK_ONLY=0
[ "${1:-}" = "--check" ] && CHECK_ONLY=1

errors=0
ok() { printf '  ✓ %s\n' "$*"; }
warn() { printf '  ! %s\n' "$*"; }
bad() { printf '  ✗ %s\n' "$*"; errors=$((errors + 1)); }
have() { command -v "$1" >/dev/null 2>&1; }
# version_ge <현재> <최소> — 점으로 나눈 숫자 비교
version_ge() { [ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -n1)" = "$2" ]; }

echo "1/4 도구 확인"
if have node; then
  v="$(node -p 'process.versions.node')"
  if version_ge "$v" "22.13.0"; then ok "node $v"; else bad "node $v — 22.13 이상이 필요하다 (https://nodejs.org 의 LTS 또는 nvm install 24)"; fi
else
  bad "node 없음 — 22.13 이상 설치 (https://nodejs.org 의 LTS 또는 nvm install 24)"
fi

if ! have pnpm && have corepack && [ "$CHECK_ONLY" = 0 ]; then
  corepack enable >/dev/null 2>&1 || true
fi
if have pnpm; then ok "pnpm $(pnpm --version 2>/dev/null | head -n1)"; else bad "pnpm 없음 — 설치: npm install -g pnpm@11.13.1  (또는 corepack enable)"; fi

if have ffmpeg && have ffprobe; then ok "ffmpeg (릴스 합성)"; else warn "ffmpeg/ffprobe 없음 — 릴스 내보내기에만 필요하다 (mac: brew install ffmpeg · Ubuntu/WSL: sudo apt install ffmpeg)"; fi

if have codex; then
  if codex login status >/dev/null 2>&1; then ok "codex 로그인됨 (배경 이미지 생성)"; else warn "codex 설치됨, 로그인 안 됨 — 실행: codex login"; fi
else
  warn "codex 없음 — 배경 이미지 생성에만 필요하다 (설치: npm install -g @openai/codex, 그다음 codex login)"
fi

if have docker; then ok "docker (선택 — 상시 실행할 때만)"; else warn "docker 없음 — 괜찮다. 편집만 할 때는 필요 없다"; fi

if [ "$errors" -gt 0 ]; then
  echo "필수 도구가 빠졌다. 위 ✗ 를 해결한 뒤 다시 실행한다."
  exit 1
fi
[ "$CHECK_ONLY" = 1 ] && { echo "확인 끝 (설치는 하지 않았다)."; exit 0; }

echo "2/4 의존성 설치 (pnpm install)"
pnpm install --frozen-lockfile

echo "3/4 .env 만들기"
if [ -f .env ]; then ok ".env 가 이미 있다 — 건드리지 않는다"; else cp .env.example .env && ok ".env 를 만들었다 (필요하면 열어서 고친다)"; fi
mkdir -p .data

echo "4/4 끝"
cat <<'EOF'

설치가 끝났다. 다음 명령으로 대시보드를 켜고 샘플 덱을 만든다:

  bash scripts/start.sh

그다음 브라우저에서 http://127.0.0.1:8930/cards 를 연다. (Claude Code 를 쓸 때는 CLAUDE.md 를 읽고 시작한다.)
EOF
