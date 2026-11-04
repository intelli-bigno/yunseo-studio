// 유스케이스 + SQLite 어댑터 + 읽기 캐시를 실제로 이어 붙여(조립부와 같은 모양) 시안 데이터 전체를 검증한다.
// 화면이 부르는 입구(유스케이스)의 결과가 옛 목업 화면과 같은지 — 옛 logic.test.ts 의 기대를 그대로 옮겼다.
import { afterAll, describe, expect, it } from "vitest";
import { createStudioUseCases, withReadCache } from "../packages/application/src/index";
import { createSqliteStudioRepository, SEED_TODAY } from "../packages/adapters/storage/src/index";

const sqlite = createSqliteStudioRepository();
const repo = withReadCache(sqlite);
const uc = createStudioUseCases({ repo, clock: { today: () => SEED_TODAY }, cards: { activeSet: async () => ({ id: "a", label: "", names: [], aspect: "3 / 4" }), read: async () => null } });
afterAll(() => sqlite.close());

describe("시안 데이터 × 유스케이스", () => {
  it("오늘: 내 게이트·막힌 편·대기열 요약이 옛 화면과 같다", async () => {
    const board = await uc.getTodayBoard();
    expect(board.mine.map((r) => r.piece.id)).toEqual(["P-1104", "R-1108"]);
    expect(board.stuck.map((r) => r.piece.id)).toEqual(["P-1105", "A-1106"]);
    expect(board.queueSummary).toEqual({ ready: 1, needs_g3: 1, mismatch: 1, posted: 1 });
    expect(board.focus?.piece.id).toBe("P-1104");
    expect(board.focus?.gate).toBe("G3");
    expect(board.focusChecked).toBe(4);
    expect(board.week.map((d) => d.date)[0]).toBe("2026-11-02");
    expect(board.week.filter((d) => d.state === "today").map((d) => d.date)).toEqual(["2026-11-04"]);
  });

  it("사이드바 숫자", async () => {
    expect(await uc.getNavSummary()).toEqual({ today: "2026-11-04", awaiting: 2, stuck: 2, unpublished: 6, ready: 1 });
  });

  it("편 상세: 이후 편은 이전 편을 닫고, 출처 미완 문장 수를 센다", async () => {
    const post = await uc.getPieceDetail("A-1106");
    expect(post?.preIssue?.id).toBe("P-1104");
    const fomc = await uc.getPieceDetail("P-1105");
    expect(fomc?.openClaims).toBe(3); // f2·f3·f4 — 옛 claimIssues 기대(출처 없음·기준 시점 없음·사람 확인 전)
    expect(await uc.getPieceDetail("nope")).toBeNull();
  });

  it("편성: 주 7일·월 35칸, 후보함은 3건", async () => {
    const week = await uc.getSchedule("week");
    expect(week.days.map((d) => d.date)[6]).toBe("2026-11-08");
    expect(week.candidates).toHaveLength(3);
    expect((await uc.getSchedule("month")).days).toHaveLength(35);
  });

  it("콘텐츠: 종류 필터, 최근 슬롯 먼저", async () => {
    expect((await uc.listContent("research")).rows.map((r) => r.piece.id)).toEqual(["R-1108", "R-1107"]);
    expect((await uc.listContent()).total).toBe(8);
  });

  it("읽기 캐시가 받쳐 주면 같은 화면을 다시 그려도 저장소를 다시 읽지 않는다", async () => {
    const before = repo.stats();
    await uc.getTodayBoard();
    await uc.getTodayBoard();
    const after = repo.stats();
    expect(after.misses).toBe(before.misses);
    expect(after.hits).toBeGreaterThan(before.hits);
  });
});
