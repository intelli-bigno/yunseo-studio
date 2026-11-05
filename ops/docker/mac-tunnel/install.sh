#!/bin/bash
# yunseo-studio 터널 launchd 에이전트 설치·해제 — Mac Studio·MacBook 공용(현재 계정의 홈에 plist 를 만든다).
#   bash install.sh              설치(이미 있으면 bootout 후 다시 bootstrap)
#   bash install.sh --check      plist 문법·ssh 접속·포트 상태만 점검(아무것도 바꾸지 않음)
#   bash install.sh --uninstall  해제(로그는 남김)
#
# Mac 의 127.0.0.1:8930 → windows-desktop 의 127.0.0.1:8930(WSL Docker 컨테이너 yunseo-dashboard). 브라우저는 http://yunseo.localhost:8930 .
# *.localhost 는 각 Mac 의 127.0.0.1 로 풀린다. 리스너는 127.0.0.1 만(LAN·Tailnet 노출 없음). Mac 에서 서버를 띄우지 않는다 — ssh 클라이언트만 상주.
#
# 함정(측정 2026-10-28, Mac Studio): launchd 가 /usr/bin/ssh 를 직접 띄우면 ~/.ssh 가 외장 SSD 심링크일 때 known_hosts 읽기가
# "Operation not permitted" 라서 /bin/bash 가 ssh 를 exec 하게 한다. 로그 경로는 반드시 내장 디스크(~/Library/Logs) — /Volumes 면 78 EX_CONFIG.
set -eu

LABEL="com.bigno.yunseo-studio-tunnel"
PORT=8930
PLIST_DST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_DIR="$HOME/Library/Logs/yunseo-studio-tunnel"
UID_N="$(id -u)"

die() { echo "실패: $*" >&2; exit 1; }

domain() {
  # 로그인한 데스크톱 세션이면 gui/<uid>, SSH 만 있으면 user/<uid>
  if launchctl print "gui/$UID_N" >/dev/null 2>&1; then echo "gui/$UID_N"; else echo "user/$UID_N"; fi
}

is_loaded() { launchctl print "$(domain)/$LABEL" >/dev/null 2>&1; }

bootout_and_wait() {
  local i=0
  launchctl bootout "$(domain)/$LABEL" 2>/dev/null || true
  while is_loaded && [ "$i" -lt 20 ]; do sleep 0.5; i=$((i + 1)); done
  ! is_loaded || die "bootout 이 끝나지 않음: launchctl print $(domain)/$LABEL"
}

render() {
  cat <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$LABEL</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>-c</string>
        <string>exec "\$0" "\$@"</string>
        <string>/usr/bin/ssh</string>
        <string>-N</string>
        <string>-T</string>
        <string>-o</string><string>BatchMode=yes</string>
        <string>-o</string><string>ExitOnForwardFailure=yes</string>
        <string>-o</string><string>ServerAliveInterval=15</string>
        <string>-o</string><string>ServerAliveCountMax=3</string>
        <string>-o</string><string>ConnectTimeout=10</string>
        <string>-o</string><string>ControlMaster=no</string>
        <string>-o</string><string>ControlPath=none</string>
        <string>-o</string><string>LogLevel=ERROR</string>
        <string>-L</string><string>127.0.0.1:$PORT:127.0.0.1:$PORT</string>
        <string>windows-desktop</string>
    </array>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><true/>
    <key>ThrottleInterval</key><integer>10</integer>
    <key>StandardOutPath</key><string>$LOG_DIR/tunnel.log</string>
    <key>StandardErrorPath</key><string>$LOG_DIR/tunnel.log</string>
</dict>
</plist>
PLIST
}

check() {
  render >"${TMPDIR:-/tmp}/$LABEL.check.plist"
  plutil -lint "${TMPDIR:-/tmp}/$LABEL.check.plist" >/dev/null || die "plist 문법 오류"
  ssh -o BatchMode=yes -o ConnectTimeout=8 windows-desktop true || die "ssh windows-desktop 접속 실패"
  echo "점검 통과: plist 문법·ssh 접속. 이 Mac 의 127.0.0.1:$PORT 리스너:"
  lsof -nP -iTCP:$PORT -sTCP:LISTEN || echo "  (없음)"
}

uninstall() {
  if is_loaded; then bootout_and_wait; echo "bootout 완료: $LABEL"; else echo "로드돼 있지 않음: $LABEL"; fi
  rm -f "$PLIST_DST"
  echo "제거: $PLIST_DST (로그 $LOG_DIR 는 남김)"
}

install() {
  if lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1 && ! is_loaded; then
    die "127.0.0.1:$PORT 를 다른 프로세스가 쓰는 중 — lsof -nP -iTCP:$PORT -sTCP:LISTEN 로 확인(옛 서버면 pid 로 kill 한 뒤 다시)"
  fi
  mkdir -p "$LOG_DIR" "$HOME/Library/LaunchAgents"
  render >"$PLIST_DST.tmp"
  plutil -lint "$PLIST_DST.tmp" >/dev/null || { rm -f "$PLIST_DST.tmp"; die "plist 문법 오류"; }
  mv "$PLIST_DST.tmp" "$PLIST_DST"
  if is_loaded; then bootout_and_wait; fi
  launchctl bootstrap "$(domain)" "$PLIST_DST"
  local i=0
  while ! lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1 && [ "$i" -lt 20 ]; do sleep 0.5; i=$((i + 1)); done
  lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1 || die "127.0.0.1:$PORT 리스너가 안 뜸 — 로그: $LOG_DIR/tunnel.log"
  echo "설치 완료: $(domain)/$LABEL  →  http://yunseo.localhost:$PORT"
}

case "${1:-}" in
  --check) check ;;
  --uninstall) uninstall ;;
  "") install ;;
  *) die "알 수 없는 인자: $1" ;;
esac
