import { describe, expect, it } from "vitest";
import type { QueueItem } from "@yunseo/domain";
import { FakeRepository, noCards, piece } from "./fakes";
import { createStudioUseCases } from "./use-cases";

const clock = { today: () => "2026-11-04" };
const q = (pieceId: string, patch: Partial<QueueItem> = {}): QueueItem => ({ pieceId, channel: "feed", approvedHash: null, currentHash: "h", postedUrl: null, ...patch });

function setup() {
  const repo = new FakeRepository(
    [
      piece("P-1", { slot: "2026-11-04T21:00", status: "in_review", gates: { G1: "passed", G2: "passed", G3: "waiting" }, claims: [{ id: "c1", mark: "fact", basis: "research", text: "t", publisher: "p", url: "https://x", quote: "q", accessedAt: "2026-11-02", asOf: "2026-11-02T09:00", verified: true }] }),
      piece("P-2", { slot: "2026-11-05T20:00", gates: { G1: "passed", G2: "blocked", G3: "todo" }, blocker: "G2 · 출처 없음" }),
      piece("A-3", { kind: "post", slot: "2026-11-06T21:00", status: "evidence_wait", preIssueId: "P-1" }),
      piece("S-4", { kind: "story", slot: "2026-11-02T08:00", status: "published", gates: { G1: "passed", G2: "passed", G3: "passed" } }),
    ],
    [q("P-1"), q("S-4", { approvedHash: "h", postedUrl: "https://x" }), q("missing")],
  );
  return { repo, uc: createStudioUseCases({ repo, clock, cards: noCards }) };
}

describe("유스케이스", () => {
  it("오늘 — 내 게이트 → 막힌 편 순으로 포커스를 고르고 이번 주를 월요일부터 채운다", async () => {
    const { uc } = setup();
    const board = await uc.getTodayBoard();
    expect(board.focus?.piece.id).toBe("P-1");
    expect(board.focusChecked).toBe(1);
    expect(board.stuck.map((r) => r.piece.id)).toEqual(["P-2", "A-3"]);
    expect(board.week.map((d) => d.date)).toEqual(["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"]);
    expect(board.week[2]).toMatchObject({ state: "today" });
    expect(board.week[0]).toMatchObject({ state: "past" });
    expect(board.queue.map((r) => r.piece.id)).toEqual(["P-1", "S-4"]); // 편이 없는 대기열 행은 건너뛴다
    expect(board.queueSummary).toEqual({ ready: 0, needs_g3: 1, mismatch: 0, posted: 1 });
  });

  it("사이드바 숫자", async () => {
    const { uc } = setup();
    expect(await uc.getNavSummary()).toEqual({ today: "2026-11-04", awaiting: 1, stuck: 2, unpublished: 3, ready: 0 });
  });

  it("편성 — 주는 7일, 월은 달력 35칸(월요일 시작)", async () => {
    const { uc } = setup();
    const week = await uc.getSchedule("week");
    expect([week.from, week.to, week.days.length]).toEqual(["2026-11-02", "2026-11-08", 7]);
    const month = await uc.getSchedule("month");
    expect([month.from, month.to, month.days.length]).toEqual(["2026-10-26", "2026-11-29", 35]);
  });

  it("콘텐츠 목록 — 종류로 거르고 최근 슬롯이 먼저, 상한을 지킨다", async () => {
    const { uc } = setup();
    expect((await uc.listContent()).rows.map((r) => r.piece.id)).toEqual(["A-3", "P-2", "P-1", "S-4"]);
    expect((await uc.listContent("post")).rows.map((r) => r.piece.id)).toEqual(["A-3"]);
    const limited = await uc.listContent("all", 2);
    expect([limited.rows.length, limited.total]).toEqual([2, 4]);
  });

  it("편 상세 — 이전 편을 함께 주고, 없는 편은 null", async () => {
    const { uc } = setup();
    const detail = await uc.getPieceDetail("A-3");
    expect(detail?.preIssue?.id).toBe("P-1");
    expect((await uc.getPieceDetail("P-1"))?.openClaims).toBe(0);
    expect(await uc.getPieceDetail("nope")).toBeNull();
  });

  it("발행 대기열 요약", async () => {
    const { uc } = setup();
    const view = await uc.getPublishQueue();
    expect(view.summary).toEqual({ ready: 0, needs_g3: 1, mismatch: 0, posted: 1 });
  });

  it("빠른 이동 색인은 편마다 한 줄", async () => {
    const { uc } = setup();
    const index = await uc.getPaletteIndex();
    expect(index.pieces.map((p) => [p.id, p.hasClaims])).toEqual([["P-1", true], ["P-2", false], ["A-3", false], ["S-4", false]]);
  });
});
