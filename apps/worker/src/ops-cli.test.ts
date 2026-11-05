import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { runOpsCli, type CliIo } from "./ops-cli";

function setup(alive = false) {
  const d = mkdtempSync(join(tmpdir(), "yunseo-cli-"));
  const dbPath = join(d, "studio.db");
  const db = new DatabaseSync(dbPath);
  db.exec("CREATE TABLE t (v TEXT); INSERT INTO t VALUES ('before')");
  db.close();
  const out: string[] = [];
  const io: CliIo = { out: (l) => out.push(l), env: { STUDIO_DB: dbPath, YUNSEO_DATA_DIR: d }, now: () => new Date("2026-11-04T18:30:00Z"), workerAlive: async () => alive };
  return { d, dbPath, out, io };
}

const values = (p: string) => {
  const db = new DatabaseSync(p, { readOnly: true });
  const v = (db.prepare("SELECT v FROM t").all() as { v: string }[]).map((r) => r.v);
  db.close();
  return v;
};

describe("ops-cli", () => {
  it("backup-now → list-backups → restore(--yes) 로 백업 시점 내용이 돌아온다", async () => {
    const { dbPath, out, io } = setup();
    expect(await runOpsCli(["backup-now"], io)).toBe(0);
    const db = new DatabaseSync(dbPath);
    db.exec("UPDATE t SET v = 'after'");
    db.close();
    expect(await runOpsCli(["list-backups"], io)).toBe(0);
    expect(out).toContain("count=1");

    expect(await runOpsCli(["restore", "studio-20261105-033000.db"], io)).toBe(0); // 계획만
    expect(values(dbPath)).toEqual(["after"]);
    expect(await runOpsCli(["restore", "studio-20261105-033000.db", "--yes"], io)).toBe(0);
    expect(values(dbPath)).toEqual(["before"]);
  });

  it("워커가 살아 있으면 복원을 거부한다", async () => {
    const { io, out } = setup(true);
    await runOpsCli(["backup-now"], io);
    expect(await runOpsCli(["restore", "studio-20261105-033000.db", "--yes"], io)).toBe(2);
    expect(out.at(-1)).toMatch(/^refused/);
  });

  it("모르는 명령은 사용법과 64", async () => {
    const { io } = setup();
    expect(await runOpsCli(["nope"], io)).toBe(64);
  });
});
