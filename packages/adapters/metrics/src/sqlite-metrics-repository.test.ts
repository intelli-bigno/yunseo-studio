import { DatabaseSync } from "node:sqlite";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { NewMetricSnapshot } from "@yunseo/domain";
import { createSqliteMetricsRepository, SqliteMetricsRepository } from "./sqlite-metrics-repository";

const snap = (patch: Partial<NewMetricSnapshot> = {}): NewMetricSnapshot => ({ pieceId: "P-1", platform: "instagram", capturedAt: "2026-11-07", source: "manual", values: { views: 10 }, note: "", ...patch });
const make = () => new SqliteMetricsRepository({ now: () => "2026-11-08T00:00:00.000Z" });

describe("SqliteMetricsRepository — 스냅샷", () => {
  it("저장하면 id 와 값을 그대로 돌려준다", async () => {
    const repo = make();
    const [saved] = await repo.upsertSnapshots([snap({ values: { views: 10, reach: 8 }, note: "메모" })]);
    expect(saved).toEqual({ id: "1", pieceId: "P-1", platform: "instagram", capturedAt: "2026-11-07", source: "manual", values: { views: 10, reach: 8 }, note: "메모" });
    expect(await repo.listSnapshots()).toEqual([saved]);
  });

  it("같은 (편, 플랫폼, 측정일, 출처)는 덮어쓰고 id 를 유지한다 — 같은 CSV 를 다시 넣어도 쌓이지 않는다", async () => {
    const repo = make();
    await repo.upsertSnapshots([snap()]);
    const [again] = await repo.upsertSnapshots([snap({ values: { views: 99 } })]);
    expect(again?.id).toBe("1");
    const all = await repo.listSnapshots();
    expect(all).toHaveLength(1);
    expect(all[0]?.values).toEqual({ views: 99 });
  });

  it("출처·측정일·플랫폼이 다르면 따로 쌓이고 측정일 순으로 읽힌다", async () => {
    const repo = make();
    await repo.upsertSnapshots([snap({ capturedAt: "2026-11-09" }), snap({ source: "csv" }), snap({ platform: "youtube", values: { views: 5 } }), snap({ capturedAt: "2026-11-01" })]);
    const all = await repo.listSnapshots();
    expect(all.map((s) => `${s.capturedAt}:${s.platform}:${s.source}`)).toEqual(["2026-11-01:instagram:manual", "2026-11-07:instagram:csv", "2026-11-07:youtube:manual", "2026-11-09:instagram:manual"]);
  });

  it("삭제: 있으면 true, 없으면 false", async () => {
    const repo = make();
    await repo.upsertSnapshots([snap()]);
    expect(await repo.deleteSnapshot("1")).toBe(true);
    expect(await repo.deleteSnapshot("1")).toBe(false);
    expect(await repo.listSnapshots()).toEqual([]);
  });

  it("묶음 저장 중 하나가 실패하면 전부 되돌린다", async () => {
    const repo = make();
    const bad = { ...snap({ pieceId: "P-2" }), values: { views: 1n } } as unknown as NewMetricSnapshot; // JSON 으로 만들 수 없는 값
    await expect(repo.upsertSnapshots([snap(), bad])).rejects.toThrow();
    expect(await repo.listSnapshots()).toEqual([]);
  });
});

describe("열 매핑 기억·가져오기 기록", () => {
  it("플랫폼·서명이 같으면 불러오고 다시 저장하면 덮어쓴다", async () => {
    const repo = make();
    expect(await repo.loadMapping("instagram", "a|b")).toBeNull();
    await repo.saveMapping("instagram", "a|b", ["title", "views"]);
    expect(await repo.loadMapping("instagram", "a|b")).toEqual(["title", "views"]);
    expect(await repo.loadMapping("youtube", "a|b")).toBeNull();
    await repo.saveMapping("instagram", "a|b", ["title", "ignore"]);
    expect(await repo.loadMapping("instagram", "a|b")).toEqual(["title", "ignore"]);
  });

  it("옛 버전·손상된 매핑은 쓰지 않는다", async () => {
    const dir = mkdtempSync(join(tmpdir(), "yunseo-l5-"));
    const path = join(dir, "studio.db");
    const repo = new SqliteMetricsRepository({ path, now: () => "2026-11-08T00:00:00.000Z" });
    await repo.saveMapping("instagram", "ok", ["views"]);
    const raw = new DatabaseSync(path);
    raw.prepare("INSERT INTO l5_column_mappings (platform, signature, mapping_json, updated_at) VALUES ('instagram', 'old', ?, 'x')").run('["views","no_such_metric"]');
    raw.prepare("INSERT INTO l5_column_mappings (platform, signature, mapping_json, updated_at) VALUES ('instagram', 'broken', ?, 'x')").run("{not json");
    raw.close();
    expect(await repo.loadMapping("instagram", "ok")).toEqual(["views"]);
    expect(await repo.loadMapping("instagram", "old")).toBeNull();
    expect(await repo.loadMapping("instagram", "broken")).toBeNull();
  });

  it("가져오기 기록은 최근 것부터 limit 개", async () => {
    const repo = make();
    for (let i = 1; i <= 3; i += 1) await repo.logImport({ platform: "instagram", capturedAt: `2026-11-0${i}`, rows: i, imported: i, unmatched: 0, skipped: 0 });
    const list = await repo.listImports(2);
    expect(list.map((l) => l.capturedAt)).toEqual(["2026-11-03", "2026-11-02"]);
    expect(list[0]).toEqual({ id: "3", platform: "instagram", capturedAt: "2026-11-03", rows: 3, imported: 3, unmatched: 0, skipped: 0, at: "2026-11-08T00:00:00.000Z" });
  });
});

describe("같은 DB 파일 공유", () => {
  it("파일로 열면 다시 열어도 값이 남고, l5_ 테이블만 만든다", async () => {
    const dir = mkdtempSync(join(tmpdir(), "yunseo-l5-"));
    const path = join(dir, "studio.db");
    const first = createSqliteMetricsRepository({ path });
    await first.upsertSnapshots([snap()]);
    const second = createSqliteMetricsRepository({ path });
    expect((await second.listSnapshots()).length).toBe(1);
    const raw = new DatabaseSync(path);
    const tables = (raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[]).map((t) => t.name);
    raw.close();
    expect(tables).toEqual(["l5_column_mappings", "l5_csv_imports", "l5_metric_snapshots"]);
  });
});
