import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { createReelsProjectStore, ReelsRevisionConflictError } from "./reels-projects";
import { createSqliteStudioRepository } from "./sqlite-studio-repository";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

let tick = 0;
const now = () => `2026-11-07T00:00:${String(tick++).padStart(2, "0")}Z`;

describe("릴스 프로젝트 저장(reels_projects)", () => {
  it("만들기 → 고치기(판 올림) → 목록(최근 순) → 지우기", () => {
    const s = createReelsProjectStore({ now });
    expect(s.save({ id: "a", title: "첫 편", data: "{}" }).revision).toBe(1);
    s.save({ id: "b", title: "둘째", data: "{}" });
    const a2 = s.save({ id: "a", title: "첫 편 고침", data: '{"x":1}', expectedRevision: 1 });
    expect(a2).toMatchObject({ revision: 2, title: "첫 편 고침", data: '{"x":1}' });
    expect(a2.createdAt < a2.updatedAt).toBe(true);
    expect(s.list().map((r) => r.id)).toEqual(["a", "b"]);
    expect(s.remove("b")).toBe(true);
    expect(s.remove("b")).toBe(false);
    expect(s.get("b")).toBeNull();
    s.close();
  });

  it("판이 다르면 쓰지 않는다", () => {
    const s = createReelsProjectStore({ now });
    s.save({ id: "a", title: "t", data: "{}" });
    s.save({ id: "a", title: "t", data: "{}" });
    expect(() => s.save({ id: "a", title: "t", data: "{1}", expectedRevision: 1 })).toThrow(ReelsRevisionConflictError);
    expect(() => s.save({ id: "new", title: "t", data: "{}", expectedRevision: 3 })).toThrow(ReelsRevisionConflictError);
    expect(s.get("a")!.data).toBe("{}");
    s.close();
  });

  it("원고 저장소와 같은 파일에 레인 테이블로 함께 산다(버전 목록은 건드리지 않는다)", () => {
    const dir = mkdtempSync(join(tmpdir(), "reels-store-"));
    dirs.push(dir);
    const path = join(dir, "studio.db");
    const repo = createSqliteStudioRepository({ path });
    const s = createReelsProjectStore({ path, now });
    s.save({ id: "a", title: "t", data: "{}" });
    s.close();
    const again = createReelsProjectStore({ path, now });
    expect(again.get("a")?.title).toBe("t");
    again.close();
    const db = new DatabaseSync(path);
    const names = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((r) => r.name);
    expect(names).toContain("reels_projects");
    const migrations = (db.prepare("SELECT name FROM schema_migrations").all() as { name: string }[]).map((r) => r.name);
    expect(migrations.some((n) => n.includes("reels"))).toBe(false);
    db.close();
    repo.close();
  });
});
