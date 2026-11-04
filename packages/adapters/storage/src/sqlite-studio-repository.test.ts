// 포트 계약 테스트 — StudioRepository 를 구현하는 어댑터는 같은 기대를 만족해야 한다(04 테스트 전략).
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createSqliteStudioRepository, type SqliteStudioRepository } from "./sqlite-studio-repository";

const opened: SqliteStudioRepository[] = [];
const open = (...args: Parameters<typeof createSqliteStudioRepository>) => {
  const repo = createSqliteStudioRepository(...args);
  opened.push(repo);
  return repo;
};
afterEach(() => {
  while (opened.length) opened.pop()!.close();
});

describe("SQLite 저장소 (StudioRepository 계약)", () => {
  it("빈 저장소를 시안 데이터로 채우고 입력 순서를 지킨다", async () => {
    const repo = open();
    const pieces = await repo.listPieces();
    expect(pieces.map((p) => p.id)).toEqual(["P-1104", "P-1105", "A-1106", "R-1107", "R-1108", "S-W45", "P-1103", "A-1102"]);
    expect((await repo.listWeekVariables()).length).toBe(4);
    expect((await repo.listEventCandidates()).map((c) => c.id)).toEqual(["E-31", "E-32", "E-33"]);
    expect((await repo.listQueue()).length).toBe(4);
  });

  it("한 편은 JSON 칸까지 원래 모양으로 되살아난다", async () => {
    const repo = open();
    const p = await repo.getPiece("P-1104");
    expect(p?.cards).toHaveLength(7);
    expect(p?.claims).toHaveLength(4);
    expect(p?.gates).toEqual({ G1: "passed", G2: "passed", G3: "waiting" });
    expect(p && "preIssueId" in p).toBe(false); // 값이 없는 선택 칸은 키 자체가 없다
    expect((await repo.getPiece("A-1106"))?.preIssueId).toBe("P-1104");
    expect((await repo.getPiece("S-W45"))?.hash).toBe("9f3c1a7e");
    expect((await repo.listWeekVariables())[0]?.closedBy).toBe("A-1106");
    expect((await repo.listEventCandidates())[2]?.decision).toBe("watch");
  });

  it("없는 편은 null", async () => {
    expect(await open().getPiece("nope")).toBeNull();
  });

  it("revision 은 채운 뒤 1", async () => {
    expect(await open().revision()).toBe(1);
  });

  it("seed:false 면 비어 있다", async () => {
    const repo = open({ seed: false });
    expect(await repo.listPieces()).toEqual([]);
    expect(await repo.revision()).toBe(0);
  });

  it("파일 저장소는 다시 열어도 한 번만 채운다", async () => {
    const dir = mkdtempSync(join(tmpdir(), "yunseo-sqlite-"));
    try {
      const path = join(dir, "studio.sqlite");
      const first = open({ path });
      expect((await first.listPieces()).length).toBe(8);
      first.close();
      opened.pop();
      const second = open({ path });
      expect((await second.listPieces()).length).toBe(8);
      expect(await second.revision()).toBe(1);
    } finally {
      while (opened.length) opened.pop()!.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
