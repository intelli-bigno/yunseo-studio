// 운영 명령 — 백업 즉시 실행·백업 목록·복원. ops/windows/opsctl.ts 가 부르고, 사람이 직접 불러도 된다.
//   tsx src/ops-cli.ts backup-now
//   tsx src/ops-cli.ts list-backups
//   tsx src/ops-cli.ts restore <백업 파일 이름 또는 경로> [--yes]   (--yes 없으면 계획만 출력)
// 환경변수는 워커와 같다(STUDIO_DB·YUNSEO_DATA_DIR 또는 YUNSEO_BACKUP_DIR). 복원은 워커·대시보드가 멈춘 상태에서만 한다.
import { isAbsolute, join } from "node:path";
import { backupSqlite, createDirBackupCatalog, restoreSqlite } from "@yunseo/adapters-ops";
import { loadWorkerConfig } from "./config";

export interface CliIo {
  out(line: string): void;
  env: Record<string, string | undefined>;
  now(): Date;
  /** 워커가 응답하면 true — 복원 전 「서비스가 멈췄는가」 확인 */
  workerAlive(url: string): Promise<boolean>;
}

export async function runOpsCli(argv: readonly string[], io: CliIo): Promise<number> {
  const config = loadWorkerConfig(io.env);
  const [cmd, arg] = argv;
  const need = (v: string | null, name: string) => {
    if (!v) throw new Error(`${name} 가 설정되지 않았다`);
    return v;
  };

  if (cmd === "backup-now") {
    const r = backupSqlite({ dbPath: need(config.dbPath, "STUDIO_DB"), dir: need(config.backupDir, "YUNSEO_DATA_DIR(또는 YUNSEO_BACKUP_DIR)"), now: io.now(), keep: config.backupKeep });
    io.out(`backup ok: ${r.path} (${r.bytes} bytes, removed ${r.removed.length})`);
    return 0;
  }
  if (cmd === "list-backups") {
    const files = await createDirBackupCatalog(config.backupDir).list();
    for (const f of files) io.out(`${f.name}\t${f.bytes}\t${f.createdAt}`);
    io.out(`count=${files.length}`);
    return 0;
  }
  if (cmd === "restore") {
    if (!arg) throw new Error("복원할 백업 파일을 지정한다: restore <파일>");
    const dbPath = need(config.dbPath, "STUDIO_DB");
    const backupPath = isAbsolute(arg) ? arg : join(need(config.backupDir, "백업 폴더"), arg);
    if (!argv.includes("--yes")) {
      io.out(`plan: ${backupPath} -> ${dbPath} (현재 DB 는 ${dbPath}.pre-restore-<시각> 으로 옮겨 둔다). 실행하려면 --yes`);
      return 0;
    }
    const url = `http://${config.host}:${config.port}/health`;
    if (await io.workerAlive(url)) {
      io.out(`refused: 워커가 아직 응답한다(${url}) — 먼저 서비스를 멈춘다(opsctl restore 가 순서를 지킨다)`);
      return 2;
    }
    const r = restoreSqlite({ backupPath, dbPath, now: io.now() });
    io.out(`restore ok: ${dbPath} (${r.bytes} bytes), set aside: ${r.setAside.join(", ") || "-"}`);
    return 0;
  }
  io.out("usage: ops-cli <backup-now|list-backups|restore <file> [--yes]>");
  return 64;
}

const isMain = process.argv[1] && /ops-cli\.ts$/.test(process.argv[1]);
if (isMain) {
  runOpsCli(process.argv.slice(2), {
    out: (l) => console.log(l),
    env: process.env,
    now: () => new Date(),
    workerAlive: async (url) => {
      try {
        return (await fetch(url, { signal: AbortSignal.timeout(1500) })).ok;
      } catch {
        return false;
      }
    },
  }).then(
    (code) => process.exit(code),
    (e: unknown) => {
      console.error(`error: ${e instanceof Error ? e.message : String(e)}`);
      process.exit(1);
    },
  );
}
