// 일일 백업 — 매일 03:30 KST, STUDIO_DB 를 백업 폴더에 날짜 파일로 복사하고 최근 N 개(기본 14)만 남긴다.
// 꺼져 있어 03:30 을 놓쳤으면 다음 기동 1분 뒤 따라잡아 한 번 돈다(catchUp).
import { backupSqlite } from "@yunseo/adapters-ops";
import type { JobDefinition } from "../registry";
import { daily } from "../schedule";

export interface BackupJobDeps {
  dbPath: string;
  dir: string;
  keep: number;
}

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(2)}MB`;

export function createBackupJob({ dbPath, dir, keep }: BackupJobDeps): JobDefinition {
  return {
    name: "backup",
    schedule: daily("03:30"),
    catchUp: true,
    timeoutMs: 10 * 60_000,
    async run({ now, log }) {
      const r = backupSqlite({ dbPath, dir, now: now(), keep });
      if (r.removed.length) log(`보존 ${keep}개 초과분 삭제: ${r.removed.join(", ")}`);
      return `${r.name} · ${mb(r.bytes)} · 삭제 ${r.removed.length}`;
    },
  };
}
