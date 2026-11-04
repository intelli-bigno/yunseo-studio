import { describe, expect, it } from "vitest";
import { daily, describeSchedule, every, nextRun, previousRun } from "./schedule";

const at = (iso: string) => new Date(iso);

describe("일정 계산", () => {
  const backup = daily("03:30"); // 03:30 KST = 18:30 UTC 전날

  it("매일 03:30 KST — 그 전이면 오늘, 지났으면 내일", () => {
    expect(nextRun(backup, at("2026-11-04T18:29:59Z")).toISOString()).toBe("2026-11-04T18:30:00.000Z");
    expect(nextRun(backup, at("2026-11-04T18:30:00Z")).toISOString()).toBe("2026-11-05T18:30:00.000Z"); // 정각이면 다음 날(뒤인 첫 시각)
    expect(nextRun(backup, at("2026-11-05T02:00:00Z")).toISOString()).toBe("2026-11-05T18:30:00.000Z");
  });

  it("KST 자정 근처(UTC 날짜와 KST 날짜가 다를 때)", () => {
    // 11-05 23:50 KST = 11-05 14:50 UTC → 다음은 11-06 03:30 KST = 11-05 18:30 UTC
    expect(nextRun(backup, at("2026-11-05T14:50:00Z")).toISOString()).toBe("2026-11-05T18:30:00.000Z");
    // 11-06 00:10 KST = 11-05 15:10 UTC → 같은 답
    expect(nextRun(backup, at("2026-11-05T15:10:00Z")).toISOString()).toBe("2026-11-05T18:30:00.000Z");
  });

  it("월말·연말을 넘긴다", () => {
    expect(nextRun(backup, at("2026-12-31T19:00:00Z")).toISOString()).toBe("2027-01-01T18:30:00.000Z");
  });

  it("놓친 실행 찾기 — 이하인 마지막 예정 시각", () => {
    expect(previousRun(backup, at("2026-11-05T02:00:00Z")).toISOString()).toBe("2026-11-04T18:30:00.000Z");
    expect(previousRun(backup, at("2026-11-04T18:30:00Z")).toISOString()).toBe("2026-11-04T18:30:00.000Z");
    expect(previousRun(backup, at("2026-11-04T18:29:00Z")).toISOString()).toBe("2026-11-03T18:30:00.000Z");
  });

  it("N 분마다 — 에포크 격자에 맞춘다", () => {
    const s = every(10);
    expect(nextRun(s, at("2026-11-05T00:03:00Z")).toISOString()).toBe("2026-11-05T00:10:00.000Z");
    expect(nextRun(s, at("2026-11-05T00:10:00Z")).toISOString()).toBe("2026-11-05T00:20:00.000Z");
    expect(previousRun(s, at("2026-11-05T00:13:00Z")).toISOString()).toBe("2026-11-05T00:10:00.000Z");
  });

  it("잘못된 입력은 등록 때 거부", () => {
    expect(() => daily("3:30")).toThrow();
    expect(() => daily("24:00")).toThrow();
    expect(() => every(0)).toThrow();
    expect(() => every(1.5)).toThrow();
  });

  it("사람이 읽는 설명", () => {
    expect(describeSchedule(backup)).toBe("매일 03:30 KST");
    expect(describeSchedule(every(10))).toBe("10분마다");
    expect(describeSchedule(every(120))).toBe("2시간마다");
    expect(describeSchedule(daily("09:00", 0))).toBe("매일 09:00 UTC+0");
  });
});
