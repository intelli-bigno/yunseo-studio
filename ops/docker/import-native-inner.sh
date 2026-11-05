# import-native.sh 가 일회용 컨테이너 안에서 실행한다(/src=네이티브 data, /work=네이티브 렌더 폴더, /data=볼륨). 지우지 않고 옮겨 둔다.
set -euo pipefail
ts=$(date +%Y%m%d-%H%M%S)
keep=/data/backups/pre-native-import-$ts
mkdir -p "$keep" /data/work
for f in studio.db studio.db-wal studio.db-shm; do [ -e "/data/$f" ] && mv "/data/$f" "$keep/"; done
for f in studio.db studio.db-wal studio.db-shm; do [ -e "/src/$f" ] && cp "/src/$f" "/data/$f"; done
cp -R /work/. /data/work/
node -e 'const {DatabaseSync}=require("node:sqlite");const d=new DatabaseSync("/data/studio.db");d.exec("PRAGMA wal_checkpoint(TRUNCATE)");console.log("pieces:",d.prepare("select id from pieces order by id").all().map(r=>r.id).join(" "))' 2>/dev/null
echo "reels: $(find /data/work -name '*-reel.mp4' | wc -l) · 이전 볼륨 DB → $keep"
