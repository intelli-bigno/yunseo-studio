import { describe, expect, it } from "vitest";
import { awaitingMe, blocked, claimIssues, currentGate, queueState, queueSummary } from "./rules";
import { addDays, isoWeek, weekDates, weekStartOf, weekday } from "./calendar";
import type { GateState, Piece, PieceClaim, QueueItem } from "./model";

const piece = (id: string, gates: [GateState, GateState, GateState], status: Piece["status"] = "drafted"): Piece => ({
  id,
  kind: "pre",
  title: id,
  slot: "2026-11-04T21:00",
  status,
  gates: { G1: gates[0], G2: gates[1], G3: gates[2] },
  blocker: null,
  viewpoint: "",
  stages: [],
  claims: [],
});

const claim = (patch: Partial<PieceClaim>): PieceClaim => ({
  id: "c",
  mark: "fact",
  basis: "research",
  text: "문장",
  publisher: "발행처",
  url: "https://example.org",
  quote: "인용",
  accessedAt: "2026-11-02",
  asOf: "2026-11-02T09:00",
  verified: true,
  ...patch,
});

describe("게이트 판단", () => {
  it("첫 미통과 게이트를 고르고, 전부 통과면 null", () => {
    expect(currentGate(piece("a", ["passed", "passed", "waiting"]))).toBe("G3");
    expect(currentGate(piece("b", ["passed", "blocked", "todo"]))).toBe("G2");
    expect(currentGate(piece("c", ["passed", "passed", "passed"]))).toBeNull();
  });

  it("내 게이트·막힌 편을 나눈다", () => {
    const list = [piece("a", ["passed", "passed", "waiting"]), piece("b", ["passed", "blocked", "todo"]), piece("c", ["passed", "todo", "todo"], "evidence_wait")];
    expect(awaitingMe(list).map((p) => p.id)).toEqual(["a"]);
    expect(blocked(list).map((p) => p.id)).toEqual(["b", "c"]);
  });
});

describe("발행 대기열", () => {
  const q = (patch: Partial<QueueItem>): QueueItem => ({ pieceId: "x", channel: "feed", approvedHash: "a", currentHash: "a", postedUrl: null, ...patch });

  it("승인 뒤 수정은 불일치로 막는다", () => {
    expect(queueState(q({ currentHash: "b" }))).toBe("mismatch");
    expect(queueState(q({ approvedHash: null }))).toBe("needs_g3");
    expect(queueState(q({ postedUrl: "https://x" }))).toBe("posted");
    expect(queueState(q({}))).toBe("ready");
  });

  it("상태별 개수를 센다", () => {
    expect(queueSummary([q({}), q({ currentHash: "b" }), q({ approvedHash: null }), q({ postedUrl: "u" })])).toEqual({ ready: 1, needs_g3: 1, mismatch: 1, posted: 1 });
  });
});

describe("출처 점검", () => {
  it("사실 claim 은 출처·인용·기준 시점이 있어야 한다", () => {
    expect(claimIssues(claim({ url: null, quote: null, accessedAt: null, asOf: null, verified: false }))).toEqual(["출처 없음", "기준 시점 없음", "사람 확인 전"]);
    expect(claimIssues(claim({}))).toEqual([]);
  });

  it("해석·시나리오는 출처 없이도 기준 시점만 요구한다", () => {
    expect(claimIssues(claim({ mark: "view", url: null, quote: null, accessedAt: null }))).toEqual([]);
    expect(claimIssues(claim({ mark: "scenario", asOf: null }))).toEqual(["기준 시점 없음"]);
  });
});

describe("날짜 계산", () => {
  it("주는 월요일부터 7일", () => {
    const d = weekDates("2026-11-02");
    expect(d).toHaveLength(7);
    expect(weekday(d[0]!)).toBe("월");
    expect(d[6]).toBe("2026-11-08");
  });

  it("그 날이 속한 주의 월요일을 구한다", () => {
    expect(weekStartOf("2026-11-04")).toBe("2026-11-02");
    expect(weekStartOf("2026-11-08")).toBe("2026-11-02");
    expect(weekStartOf("2026-11-02")).toBe("2026-11-02");
  });

  it("일수 더하기·ISO 주차", () => {
    expect(addDays("2026-10-31", 2)).toBe("2026-11-02");
    expect(isoWeek("2026-11-04")).toBe(45);
  });
});
