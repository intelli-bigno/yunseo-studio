// 백업 목록·로그 꼬리 — 파일 시스템 읽기만 한다(쓰기 없음).
import { existsSync, openSync, readdirSync, readSync, closeSync, statSync } from "node:fs";
import { join } from "node:path";
import type { OpsBackupCatalog, OpsBackupFile, OpsLogSource, OpsLogTail } from "@yunseo/application";
import { backupTime } from "./backup-names";

export function createDirBackupCatalog(dir: string | null): OpsBackupCatalog {
  return {
    location: () => dir,
    async list() {
      if (!dir || !existsSync(dir)) return [];
      const files: OpsBackupFile[] = [];
      for (const name of readdirSync(dir)) {
        const createdAt = backupTime(name);
        if (createdAt) files.push({ name, createdAt, bytes: statSync(join(dir, name)).size });
      }
      return files.sort((a, b) => (a.name < b.name ? 1 : -1));
    },
  };
}

/** 파일 끝에서 maxBytes 만 읽어 마지막 lines 줄을 돌려준다(큰 로그도 통째로 읽지 않는다) */
export function tailFile(path: string, lines: number, maxBytes = 64 * 1024): { lines: string[]; bytes: number } {
  if (!existsSync(path)) return { lines: [], bytes: 0 };
  const size = statSync(path).size;
  const len = Math.min(size, maxBytes);
  const buf = Buffer.alloc(len);
  const fd = openSync(path, "r");
  try {
    readSync(fd, buf, 0, len, size - len);
  } finally {
    closeSync(fd);
  }
  let text = buf.toString("utf8");
  if (len < size) text = text.slice(text.indexOf("\n") + 1); // 잘린 첫 줄은 버린다
  const all = text.split(/\r?\n/);
  if (all.at(-1) === "") all.pop();
  return { lines: all.slice(-lines), bytes: size };
}

/** 이름이 정해진 로그만 읽는다(화이트리스트) — 경로를 요청에서 받지 않는다 */
export function createFileLogSource(dir: string | null, names: readonly string[]): OpsLogSource {
  return {
    async tail(lines) {
      if (!dir) return [];
      return names.map((name): OpsLogTail => ({ name, ...tailFile(join(dir, `${name}.log`), lines) }));
    },
  };
}
