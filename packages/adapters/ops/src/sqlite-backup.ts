// SQLite 온라인 백업·복원 — Node 내장 node:sqlite 만 쓴다(네이티브 모듈 없음).
// 백업은 VACUUM INTO: 읽기 트랜잭션 하나로 일관된 사본을 만든다(대시보드·워커가 DB 를 연 채로도 된다, WAL 포함).
// 사본은 .partial 이름으로 만들고 무결성 검사(PRAGMA integrity_check)를 통과한 뒤에만 최종 이름으로 바꾼다 —
// 반쯤 쓰인 파일이 백업 목록에 섞이지 않는다.
import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, statSync, unlinkSync } from "node:fs";
import { basename, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { backupName, DEFAULT_BACKUP_KEEP, expiredBackups } from "./backup-names";

export interface BackupOptions {
  dbPath: string;
  dir: string;
  now: Date;
  keep?: number;
}

export interface BackupResult {
  name: string;
  path: string;
  bytes: number;
  /** 보존 개수를 넘어 지운 이전 백업 이름 */
  removed: string[];
}

/** 열어서 integrity_check 가 ok 인지. 문제 목록(최대 5줄)을 돌려준다 — 빈 배열이면 정상 */
export function integrityProblems(path: string): string[] {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const rows = db.prepare("PRAGMA integrity_check(5)").all() as { integrity_check: string }[];
    const msgs = rows.map((r) => String(r.integrity_check));
    return msgs.length === 1 && msgs[0] === "ok" ? [] : msgs;
  } finally {
    db.close();
  }
}

export function backupSqlite({ dbPath, dir, now, keep = DEFAULT_BACKUP_KEEP }: BackupOptions): BackupResult {
  // DatabaseSync 는 없는 파일을 새로 만든다 — 빈 DB 를 「백업」하는 일이 없게 먼저 막는다.
  if (!existsSync(dbPath)) throw new Error(`DB 파일이 없다: ${dbPath}`);
  mkdirSync(dir, { recursive: true });
  const name = backupName(now);
  const path = join(dir, name);
  if (existsSync(path)) throw new Error(`같은 이름의 백업이 이미 있다: ${name}`);
  const partial = `${path}.partial`;
  if (existsSync(partial)) unlinkSync(partial); // 이전 실패의 찌꺼기

  const db = new DatabaseSync(dbPath);
  try {
    db.exec("PRAGMA busy_timeout = 10000");
    db.prepare("VACUUM INTO ?").run(partial);
  } finally {
    db.close();
  }
  const problems = integrityProblems(partial);
  if (problems.length) {
    unlinkSync(partial);
    throw new Error(`백업 무결성 검사 실패: ${problems.join("; ")}`);
  }
  renameSync(partial, path);

  const removed = expiredBackups(readdirSync(dir), keep);
  for (const old of removed) unlinkSync(join(dir, old));
  return { name, path, bytes: statSync(path).size, removed };
}

export interface RestoreOptions {
  backupPath: string;
  dbPath: string;
  now: Date;
}

export interface RestoreResult {
  /** 복원 전 DB(와 -wal·-shm)를 옮겨 둔 경로들. 원래 DB 가 없었으면 빈 배열 */
  setAside: string[];
  bytes: number;
}

/**
 * 백업 파일로 DB 를 되돌린다. **DB 를 쓰는 프로세스(대시보드·워커)를 먼저 멈춘 뒤에만** 부른다(opsctl restore 가 그 순서를 지킨다).
 * 지금 DB 는 지우지 않고 `<db>.pre-restore-<시각>` 으로 옮겨 둔다 — 복원이 잘못돼도 되돌릴 수 있다.
 */
export function restoreSqlite({ backupPath, dbPath, now }: RestoreOptions): RestoreResult {
  if (!existsSync(backupPath)) throw new Error(`백업 파일이 없다: ${backupPath}`);
  const problems = integrityProblems(backupPath);
  if (problems.length) throw new Error(`백업 파일이 손상됐다(${basename(backupPath)}): ${problems.join("; ")}`);

  const staging = `${dbPath}.restoring`;
  copyFileSync(backupPath, staging);
  const stagedProblems = integrityProblems(staging);
  if (stagedProblems.length) {
    unlinkSync(staging);
    throw new Error(`복사본 검사 실패: ${stagedProblems.join("; ")}`);
  }

  const stamp = backupName(now).replace(/^studio-|\.db$/g, "");
  const setAside: string[] = [];
  for (const suffix of ["", "-wal", "-shm"]) {
    const from = `${dbPath}${suffix}`;
    if (!existsSync(from)) continue;
    const to = `${dbPath}.pre-restore-${stamp}${suffix}`;
    renameSync(from, to);
    setAside.push(to);
  }
  renameSync(staging, dbPath);
  return { setAside, bytes: statSync(dbPath).size };
}
