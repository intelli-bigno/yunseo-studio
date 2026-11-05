#!/usr/bin/env bash
# 설치 앱 목록을 모아 상주 컨테이너 볼륨(/data/apps/<기기>)에 넣는다 — Mac 에서 실행.
#   bash ops/apps/sync.sh windows   # windows-desktop 시작 메뉴 앱(아이콘 포함)
#   bash ops/apps/sync.sh mac       # 지금 이 Mac 의 /Applications
# 결과는 대시보드 /status 의 「설치 앱」 칸. 코드는 Git 으로 Windows 에 이미 있다(배포 체크아웃의 ops/apps).
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
host=${YUNSEO_WIN_HOST:-windows-desktop}
stamp=$(date +%s)
case "${1:-}" in
  windows)
    win_out="C:/Users/yjh99/AppData/Local/Temp/yunseo-apps-$stamp"
    scp -q "$here/collect-windows.ps1" "$host:C:/Users/yjh99/AppData/Local/Temp/yunseo-collect-apps.ps1"
    ssh "$host" "powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:/Users/yjh99/AppData/Local/Temp/yunseo-collect-apps.ps1 -Out $win_out"
    wsl_out="/mnt/c/Users/yjh99/AppData/Local/Temp/yunseo-apps-$stamp"
    ssh "$host" "MSYS_NO_PATHCONV=1 wsl.exe -d Ubuntu -- bash -lc 'docker exec yunseo-studio mkdir -p /data/apps/windows-desktop && tar -C $wsl_out -cf - . | docker exec -i yunseo-studio tar -C /data/apps/windows-desktop -xf -'"
    ;;
  mac)
    tmp=$(mktemp -d)
    machine=$(hostname -s | tr 'A-Z' 'a-z' | tr -c 'a-z0-9-\n' '-')
    bash "$here/collect-mac.sh" "$tmp" "$machine"
    tar -C "$tmp" -cf - . | ssh "$host" "MSYS_NO_PATHCONV=1 wsl.exe -d Ubuntu -- bash -lc 'docker exec yunseo-studio mkdir -p /data/apps/$machine && docker exec -i yunseo-studio tar -C /data/apps/$machine -xf -'"
    ;;
  *) echo "사용: $0 windows|mac" >&2; exit 2 ;;
esac
echo "완료 — http://yunseo.localhost:8930/status 「설치 앱」"
