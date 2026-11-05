#!/usr/bin/env bash
# 네이티브 상주(작업 스케줄러 \YunseoStudio\*) → WSL Docker 볼륨 1회 이관 — Mac 에서 실행(2026-11-05 사용자 결정: 상주는 Docker 하나).
#  1) 네이티브 대시보드·워커를 멈추고 작업을 끈 뒤 지운다(지우기는 관리자 권한이 없으면 「사용 안 함」으로 남는다 — 그래도 다시 안 뜬다)
#  2) 컨테이너를 멈추고, 볼륨의 지금 DB 를 /data/backups/pre-native-import-<시각>/ 로 옮겨 둔 뒤 네이티브 DB(+WAL)와 렌더 산출물(카드·MP4)을 볼륨에 넣는다
#  3) 컨테이너를 다시 띄우고 헬스를 기다린다
#   bash ops/docker/import-native.sh [--dry-run]
set -euo pipefail
HOST=${YUNSEO_WIN_HOST:-windows-desktop}
DRY=0; [ "${1:-}" = --dry-run ] && DRY=1
run() { printf '+ %s\n' "$*"; [ "$DRY" = 1 ] || "$@"; }
here=$(cd "$(dirname "$0")" && pwd)

# 1) 네이티브 정지 — 중지 표식을 먼저 두면 감시 프로세스가 자식을 다시 띄우지 않는다
run ssh "$HOST" 'for s in dashboard worker; do : > "/d/Services/yunseo-studio/run/$s.stop"; done
for t in Dashboard Worker; do
  schtasks.exe //End //TN "\\YunseoStudio\\$t" >/dev/null 2>&1 || true
  schtasks.exe //Change //TN "\\YunseoStudio\\$t" //DISABLE >/dev/null 2>&1 || true
  schtasks.exe //Delete //TN "\\YunseoStudio\\$t" //F >/dev/null 2>&1 && echo "task $t deleted" || echo "task $t disabled (delete needs admin)"
done
sleep 5
netstat -ano | grep -E "100\.84\.73\.107:(8930|8931) .*LISTENING" && { echo "native still listening" >&2; exit 1; } || echo "native stopped"'

# 2) 볼륨으로 옮기기 — 컨테이너를 멈춘 동안 같은 이미지로 볼륨만 붙인 일회용 컨테이너가 복사한다
run ssh "$HOST" 'wsl.exe -d Ubuntu -- docker stop yunseo-studio'
if [ "$DRY" = 0 ]; then
  ssh "$HOST" 'MSYS_NO_PATHCONV=1 wsl.exe -d Ubuntu -- docker run --rm -i --user node -v yunseo-studio-data:/data -v /mnt/d/Services/yunseo-studio/data:/src:ro -v /mnt/c/Users/yjh99/AppData/Local/Temp/yunseo-studio-work:/work:ro --entrypoint bash yunseo-studio:local -s' < "$here/import-native-inner.sh"
else
  echo "+ docker run --rm (볼륨 복사: ops/docker/import-native-inner.sh)"
fi
run ssh "$HOST" 'wsl.exe -d Ubuntu -- docker start yunseo-studio'
[ "$DRY" = 1 ] || bash "$here/ctl.sh" status
