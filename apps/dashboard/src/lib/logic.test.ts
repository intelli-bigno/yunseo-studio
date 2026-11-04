import { describe, expect, it } from "vitest";
import { awaitingMe, blocked, claimIssues, currentGate, queueState, queueSummary, weekDates, weekday } from "./logic";
import { PIECES, QUEUE, WEEK_START } from "./mock";
import { goTarget, stepTab } from "./shortcuts";

const byId = (id: string) => PIECES.find((p) => p.id === id)!;

describe("게이트 판단", () => {
  it("첫 미통과 게이트를 고른다", () => {
    expect(currentGate(byId("P-1104"))).toBe("G3");
    expect(currentGate(byId("P-1105"))).toBe("G2");
    expect(currentGate(byId("P-1103"))).toBeNull();
  });
  it("내 게이트·막힌 편을 나눈다", () => {
    expect(awaitingMe(PIECES).map((p) => p.id)).toEqual(["P-1104", "R-1108"]);
    expect(blocked(PIECES).map((p) => p.id)).toEqual(["P-1105", "A-1106"]);
  });
});

describe("발행 대기열", () => {
  it("승인 뒤 수정은 불일치로 막는다", () => {
    expect(queueState({ pieceId: "x", channel: "feed", approvedHash: "a", currentHash: "b", postedUrl: null })).toBe("mismatch");
    expect(queueSummary(QUEUE)).toEqual({ ready: 1, needs_g3: 1, mismatch: 1, posted: 1 });
  });
});

describe("출처 점검", () => {
  it("사실 claim 은 출처·인용·기준 시점이 있어야 한다", () => {
    const f2 = byId("P-1105").claims.find((c) => c.id === "f2")!;
    expect(claimIssues(f2)).toEqual(["출처 없음", "기준 시점 없음", "사람 확인 전"]);
    const c1 = byId("P-1104").claims.find((c) => c.id === "c1")!;
    expect(claimIssues(c1)).toEqual([]);
  });
});

describe("날짜·단축키", () => {
  it("주는 월요일부터 7일", () => {
    const d = weekDates(WEEK_START);
    expect(d).toHaveLength(7);
    expect(weekday(d[0]!)).toBe("월");
    expect(d[6]).toBe("2026-11-08");
  });
  it("g 다음 키로 이동하고 탭은 순환한다", () => {
    expect(goTarget("s")).toBe("/schedule");
    expect(goTarget("x")).toBeNull();
    expect(stepTab("write", -1)).toBe("review");
    expect(stepTab("review", 1)).toBe("write");
  });
});
