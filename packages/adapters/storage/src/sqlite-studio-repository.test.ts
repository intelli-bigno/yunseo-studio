// 포트 계약 테스트 — StudioRepository(읽기)·AuthoringStore(쓰기)를 구현하는 어댑터는 같은 기대를 만족해야 한다(04 테스트 전략).
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { PieceNotFoundError, RevisionConflictError, type NewRevision } from "@yunseo/application";
import { applyAction, applyEdit, contentHash, newPiece, type Piece } from "@yunseo/domain";
import { MIGRATIONS, SCHEMA_VERSION, migrate } from "./migrations";
import { DEFAULT_SEED, createSqliteStudioRepository, type SqliteStudioRepository } from "./sqlite-studio-repository";

const opened: SqliteStudioRepository[] = [];
const open = (...args: Parameters<typeof createSqliteStudioRepository>) => {
  const repo = createSqliteStudioRepository(...args);
  opened.push(repo);
  return repo;
};
afterEach(() => {
  while (opened.length) opened.pop()!.close();
});

const tmp = () => mkdtempSync(join(tmpdir(), "yunseo-sqlite-"));
const entry = (p: Piece, patch: Partial<NewRevision> = {}): NewRevision => ({ at: "2026-11-05T10:00", actor: "윤서", changeKind: "edit", reason: null, readerNote: null, followUp: null, changes: [], contentHash: contentHash(p), status: p.status, ...patch });
const who = { actor: "윤서", at: "2026-11-05T10:00" };

describe("SQLite 저장소 (StudioRepository 계약)", () => {
  it("열기만 해서는 비어 있다 — 시안은 명시적으로만 채운다", async () => {
    const repo = open();
    expect(await repo.listPieces()).toEqual([]);
    expect(await repo.countPieces()).toBe(0);
    expect(await repo.revision()).toBe(0);
  });

  it("빈 DB 데모 채우기: 비어 있을 때만 채우고 입력 순서를 지킨다", async () => {
    const repo = open();
    expect(await repo.seedDemo()).toBe(true);
    expect((await repo.listPieces()).map((p) => p.id)).toEqual(["P-1104", "P-1105", "A-1106", "R-1107", "R-1108", "S-W45", "P-1103", "A-1102"]);
    expect((await repo.listWeekVariables()).length).toBe(4);
    expect((await repo.listEventCandidates()).map((c) => c.id)).toEqual(["E-31", "E-32", "E-33"]);
    expect((await repo.listQueue()).length).toBe(4);
    expect(await repo.seedDemo()).toBe(false);
    expect(await repo.countPieces()).toBe(8);
  });

  it("한 편은 JSON 칸까지 원래 모양으로 되살아난다", async () => {
    const repo = open({ seed: DEFAULT_SEED });
    const p = await repo.getPiece("P-1104");
    expect(p?.cards).toHaveLength(7);
    expect(p?.claims).toHaveLength(4);
    expect(p?.gates).toEqual({ G1: "passed", G2: "passed", G3: "waiting" });
    expect(p?.scenarios?.map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
    expect(p && "preIssueId" in p).toBe(false); // 값이 없는 선택 칸은 키 자체가 없다
    expect((await repo.getPiece("A-1106"))?.preIssueId).toBe("P-1104");
    expect((await repo.getPiece("S-W45"))?.hash).toBe("9f3c1a7e");
    expect((await repo.listWeekVariables())[0]?.closedBy).toBe("A-1106");
    expect((await repo.listEventCandidates())[2]?.decision).toBe("watch");
  });

  it("없는 편은 null", async () => {
    expect(await open().getPiece("nope")).toBeNull();
  });

  it("파일 저장소는 다시 열어도 한 번만 채운다", async () => {
    const dir = tmp();
    try {
      const path = join(dir, "studio.sqlite");
      const first = open({ path, seed: DEFAULT_SEED });
      expect((await first.listPieces()).length).toBe(8);
      first.close();
      opened.pop();
      const second = open({ path, seed: DEFAULT_SEED });
      expect((await second.listPieces()).length).toBe(8);
      expect(await second.revision()).toBe(1);
    } finally {
      while (opened.length) opened.pop()!.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("마이그레이션 버전 테이블", () => {
  it("새 DB 는 전 버전을 한 번씩 적용하고, 다시 열면 아무것도 안 한다", () => {
    const db = new DatabaseSync(":memory:");
    expect(migrate(db)).toEqual(MIGRATIONS.map((m) => m.version));
    expect(migrate(db)).toEqual([]);
    const versions = (db.prepare("SELECT version FROM schema_migrations ORDER BY version").all() as { version: number }[]).map((r) => r.version);
    expect(versions).toEqual([1, 2]);
    expect(SCHEMA_VERSION).toBe(2);
    db.close();
  });

  it("버전 테이블 이전에 만든 파일(v1 모양)도 v2 로 올린다 — 데이터는 그대로", async () => {
    const dir = tmp();
    try {
      const path = join(dir, "old.sqlite");
      const old = new DatabaseSync(path);
      old.exec(MIGRATIONS[0]!.sql);
      old.prepare("INSERT INTO pieces (position, id, kind, title, slot, status, gates, blocker, viewpoint, stages, claims) VALUES (0,'P-OLD','pre','옛 편','2026-11-01T21:00','drafted',?,NULL,'',?,?)").run(JSON.stringify({ G1: "passed", G2: "todo", G3: "todo" }), "[]", "[]");
      old.close();
      const repo = open({ path });
      expect(repo.schemaVersions()).toEqual([1, 2]);
      const p = await repo.loadPiece("P-OLD");
      expect(p?.revision).toBe(1);
      expect(p?.approvals).toEqual([]);
      expect(await repo.listRevisions("P-OLD")).toEqual([]);
    } finally {
      while (opened.length) opened.pop()!.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("실패한 마이그레이션은 되돌리고 버전도 남기지 않는다", () => {
    const db = new DatabaseSync(":memory:");
    expect(() => migrate(db, [...MIGRATIONS, { version: 3, name: "broken", sql: "CREATE TABLE t (a); INSERT INTO nope VALUES (1);" }])).toThrow();
    expect(db.prepare("SELECT 1 FROM schema_migrations WHERE version = 3").get()).toBeUndefined();
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 't'").get()).toBeUndefined();
    db.close();
  });
});

describe("SQLite 저장소 (AuthoringStore 계약)", () => {
  const fresh = (id = "P-1") => newPiece({ id, kind: "pre", title: "새 편", slot: "2026-11-06T21:00", viewpoint: "관점" });

  it("새 편은 버전 1 + 생성 이력 1줄, 같은 id 는 거절", async () => {
    const repo = open();
    const p = fresh();
    expect(await repo.createPiece(p, entry(p, { changeKind: "create" }))).toBe(1);
    const back = await repo.loadPiece("P-1");
    expect(back).toMatchObject({ id: "P-1", status: "idea", revision: 1, viewpoint: "관점", scenarios: [], checks: [] });
    expect((await repo.listRevisions("P-1")).map((r) => [r.revision, r.changeKind, r.actor])).toEqual([[1, "create", "윤서"]]);
    await expect(repo.createPiece(p, entry(p))).rejects.toThrow(/이미 있는/);
    expect(await repo.revision()).toBe(1);
  });

  it("저장 → 재조회: 버전이 오르고, 이력·게이트 기록이 같은 트랜잭션에 남는다", async () => {
    const repo = open();
    const p = fresh();
    await repo.createPiece(p, entry(p, { changeKind: "create" }));
    const sel = applyAction((await repo.loadPiece("P-1"))!, "select", { ...who, importance: "major" });
    expect(await repo.savePiece({ piece: sel.piece, expectedRevision: 1, entry: entry(sel.piece, { changeKind: "action:select" }), approval: sel.approval })).toBe(2);
    const back = await repo.loadPiece("P-1");
    expect(back?.status).toBe("selected");
    expect(back?.importance).toBe("major");
    expect(back?.revision).toBe(2);
    expect(back?.approvals).toEqual([sel.approval]);
    expect((await repo.listRevisions("P-1")).map((r) => r.changeKind)).toEqual(["create", "action:select"]);
  });

  it("낙관적 동시성: 읽은 버전이 낡으면 거절하고 아무것도 바꾸지 않는다", async () => {
    const repo = open();
    const p = fresh();
    await repo.createPiece(p, entry(p));
    const a = { ...p, title: "A 가 고침" };
    await repo.savePiece({ piece: a, expectedRevision: 1, entry: entry(a), approval: null });
    const b = { ...p, title: "B 가 고침" };
    await expect(repo.savePiece({ piece: b, expectedRevision: 1, entry: entry(b), approval: null })).rejects.toBeInstanceOf(RevisionConflictError);
    expect((await repo.loadPiece("P-1"))?.title).toBe("A 가 고침");
    expect(await repo.listRevisions("P-1")).toHaveLength(2);
    await expect(repo.savePiece({ piece: fresh("P-404"), expectedRevision: 1, entry: entry(p), approval: null })).rejects.toBeInstanceOf(PieceNotFoundError);
  });

  it("다른 연결이 먼저 저장해도(같은 파일) 충돌로 잡힌다", async () => {
    const dir = tmp();
    try {
      const path = join(dir, "s.sqlite");
      const one = open({ path });
      const two = open({ path });
      const p = fresh();
      await one.createPiece(p, entry(p));
      await one.savePiece({ piece: { ...p, title: "하나" }, expectedRevision: 1, entry: entry(p), approval: null });
      await expect(two.savePiece({ piece: { ...p, title: "둘" }, expectedRevision: 1, entry: entry(p), approval: null })).rejects.toBeInstanceOf(RevisionConflictError);
      expect((await two.loadPiece("P-1"))?.title).toBe("하나");
    } finally {
      while (opened.length) opened.pop()!.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("G3 승인은 발행 대기열 피드 행을 승인 해시로 맞추고, 그 뒤 수정은 현재 해시만 바꾼다(불일치)", async () => {
    const repo = open();
    const p = { ...fresh(), status: "in_review" as const, approvals: [{ gate: "G2" as const, decision: "approved" as const, actor: "윤서", at: who.at, contentHash: contentHash(fresh()), note: null }] };
    await repo.createPiece(p, entry(p));
    // 저장소 계약 시험 — 게이트 규칙(도메인)은 따로 시험한다. 빈 편이라 [L9] 렌더 전 검사에 막히므로 승인 기록을 직접 만든다
    const approval = { gate: "G3" as const, decision: "approved" as const, actor: "윤서", at: who.at, contentHash: contentHash(p), note: null };
    const ok = { piece: { ...p, status: "approved" as const, hash: contentHash(p).slice(0, 8), approvals: [...p.approvals, approval] }, approval };
    await repo.savePiece({ piece: ok.piece, expectedRevision: 1, entry: entry(ok.piece), approval: ok.approval });
    const [row] = await repo.listQueue();
    expect(row).toMatchObject({ pieceId: "P-1", channel: "feed", approvedHash: contentHash(p).slice(0, 8), currentHash: contentHash(p).slice(0, 8) });
    const edited = applyEdit((await repo.loadPiece("P-1"))!, { title: "바뀐 제목" }, who).piece;
    await repo.savePiece({ piece: edited, expectedRevision: 2, entry: entry(edited), approval: null });
    const [after] = await repo.listQueue();
    expect(after?.approvedHash).not.toBe(after?.currentHash);
  });

  it("[L9] G3 반려(수정 요청) 기록이면 대기열 승인 해시를 비운다 — 「G3 필요」로", async () => {
    const repo = open();
    const p = fresh();
    await repo.createPiece(p, entry(p));
    const yes = { gate: "G3" as const, decision: "approved" as const, actor: "윤서", at: who.at, contentHash: contentHash(p), note: null };
    await repo.savePiece({ piece: { ...p, status: "approved" }, expectedRevision: 1, entry: entry(p), approval: yes });
    expect((await repo.listQueue())[0]?.approvedHash).not.toBeNull();
    const no = { ...yes, decision: "rejected" as const, note: "표현 다시" };
    await repo.savePiece({ piece: { ...p, status: "drafted" }, expectedRevision: 2, entry: entry(p), approval: no });
    expect((await repo.listQueue())[0]?.approvedHash).toBeNull();
  });

  it("이전 편 ↔ 이후 편 조회", async () => {
    const repo = open();
    const pre = fresh("P-1");
    const post = newPiece({ id: "A-1", kind: "post", title: "후", slot: "2026-11-08T21:00", preIssueId: "P-1" });
    await repo.createPiece(pre, entry(pre));
    await repo.createPiece(post, entry(post));
    expect((await repo.findLinkedPosts("P-1")).map((p) => p.id)).toEqual(["A-1"]);
    expect((await repo.listPreIssues()).map((p) => p.id)).toEqual(["P-1"]);
    expect((await repo.loadPiece("A-1"))?.evidence).toEqual({ primary: false, observed: false, allScenarios: false, separated: false });
  });

  it("파이프라인 기록은 편마다 하나, 덮어쓴다", async () => {
    const repo = open();
    expect(await repo.getPipeline("P-1")).toBeNull();
    const file = { name: "a.zip", path: "/x/a.zip", bytes: 3, sha256: "00" };
    await repo.savePipeline({ pieceId: "P-1", contentHash: "h1", render: null, reel: null, bundle: null, updatedAt: "t1" });
    await repo.savePipeline({ pieceId: "P-1", contentHash: "h2", render: null, reel: null, bundle: { pieceId: "P-1", zip: file }, updatedAt: "t2" });
    expect(await repo.getPipeline("P-1")).toEqual({ pieceId: "P-1", contentHash: "h2", render: null, reel: null, bundle: { pieceId: "P-1", zip: file }, updatedAt: "t2" });
  });

  it("시안의 통과 게이트는 그 내용 해시로 통과 기록이 남는다", async () => {
    const repo = open({ seed: DEFAULT_SEED });
    const published = await repo.loadPiece("P-1103");
    expect(published?.approvals?.map((a) => a.gate)).toEqual(["G1", "G2", "G3"]);
    expect(published?.approvals?.every((a) => a.contentHash === contentHash(published))).toBe(true);
  });
});
