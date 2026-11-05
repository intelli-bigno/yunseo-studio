import { describe, expect, it } from "vitest";
import { derivedRates, kindSummaries, latestSnapshots, metricKeysFor, pieceRows, totalsOf, validateMetricValues, weekSummaries } from "./index";
import type { MetricSnapshot, PieceRef } from "./index";

const snap = (id: number, pieceId: string, platform: MetricSnapshot["platform"], capturedAt: string, values: MetricSnapshot["values"]): MetricSnapshot => ({
  id: String(id),
  pieceId,
  platform,
  capturedAt,
  source: "manual",
  values,
  note: "",
});
const pieces: PieceRef[] = [
  { id: "P-1", title: "이전 편", kind: "pre", slot: "2026-11-04T21:00" },
  { id: "A-1", title: "이후 편", kind: "post", slot: "2026-11-05T21:00" },
  { id: "R-1", title: "연구 편", kind: "research", slot: "2026-11-12T21:00" },
];

describe("지표 정의", () => {
  it("플랫폼별 지표 목록 — Instagram 은 저장·프로필 방문·팔로우, YouTube 는 시청 시간·구독", () => {
    expect(metricKeysFor("instagram")).toEqual(expect.arrayContaining(["views", "reach", "saved", "shares", "profile_visits", "follows"]));
    expect(metricKeysFor("instagram")).not.toContain("watch_minutes");
    expect(metricKeysFor("youtube")).toEqual(expect.arrayContaining(["views", "watch_minutes", "avg_view_sec", "subscribers_gained"]));
    expect(metricKeysFor("youtube")).not.toContain("saved");
  });
});

describe("값 검증", () => {
  it("정상 값은 통과", () => {
    expect(validateMetricValues("instagram", { views: 100, reach: 80, saved: 5 })).toEqual([]);
    expect(validateMetricValues("youtube", { watch_minutes: 12.5, avg_view_percent: 70.2 })).toEqual([]);
  });

  it("빈 입력·음수·소수 횟수·100% 초과·다른 플랫폼 지표를 막는다", () => {
    expect(validateMetricValues("instagram", {})).toEqual(["입력된 지표가 없다"]);
    expect(validateMetricValues("instagram", { views: -1 })).toEqual(["조회: 음수일 수 없다"]);
    expect(validateMetricValues("instagram", { views: 1.5 })).toEqual(["조회: 정수여야 한다"]);
    expect(validateMetricValues("youtube", { avg_view_percent: 101 })).toEqual(["평균 시청 비율(%): 100 을 넘을 수 없다"]);
    expect(validateMetricValues("instagram", { watch_minutes: 3 })).toEqual(["시청 시간(분) 는 instagram 지표가 아니다"]);
    expect(validateMetricValues("instagram", { views: Number.NaN })).toEqual(["조회: 숫자가 아니다"]);
  });
});

describe("최신 값·비율", () => {
  it("(편, 플랫폼)마다 가장 늦은 측정일의 값, 같은 날이면 나중 id", () => {
    const latest = latestSnapshots([
      snap(1, "P-1", "instagram", "2026-11-05", { views: 10 }),
      snap(2, "P-1", "instagram", "2026-11-07", { views: 30 }),
      snap(3, "P-1", "instagram", "2026-11-07", { views: 35 }),
      snap(4, "P-1", "youtube", "2026-11-06", { views: 7 }),
    ]);
    expect(latest.map((s) => [s.platform, s.values.views]).sort()).toEqual([["instagram", 35], ["youtube", 7]]);
  });

  it("비율: 분모가 없거나 0 이면 null — 0 으로 나누지 않는다", () => {
    expect(derivedRates({ saved: 45, reach: 900, follows: 9, profile_visits: 60 })).toMatchObject({ saveRate: 0.05, followPerVisit: 0.15 });
    expect(derivedRates({ saved: 5, reach: 0 }).saveRate).toBeNull();
    expect(derivedRates({}).followPerVisit).toBeNull();
    expect(derivedRates({ likes: 80, comments: 6, saved: 45, shares: 12, reach: 1000 }).interactionRate).toBeCloseTo(0.143, 10);
    expect(derivedRates({ total_interactions: 200, reach: 1000, likes: 1 }).interactionRate).toBe(0.2);
    expect(derivedRates({ subscribers_gained: 25, views: 5000 }).subscribePerView).toBe(0.005);
  });
});

describe("편별·종별 집계", () => {
  const snaps = [
    snap(1, "P-1", "instagram", "2026-11-06", { views: 1200, reach: 900, saved: 45, shares: 12, profile_visits: 60, follows: 9 }),
    snap(2, "A-1", "instagram", "2026-11-06", { views: 800, reach: 610, saved: 15, shares: 5, profile_visits: 30, follows: 3 }),
    snap(3, "P-1", "youtube", "2026-11-06", { views: 5000, watch_minutes: 1500, subscribers_gained: 25 }),
    snap(4, "GONE", "instagram", "2026-11-06", { views: 9 }),
  ];

  it("편이 사라진 스냅샷은 건너뛰고 최근 슬롯부터 정렬한다", () => {
    const rows = pieceRows(pieces, snaps);
    expect(rows.map((r) => `${r.piece.id}:${r.platform}`)).toEqual(["A-1:instagram", "P-1:instagram", "P-1:youtube"]);
  });

  it("합계: 도달·평균은 더하지 않고, 더해도 되는 지표만 합친다", () => {
    const rows = pieceRows(pieces, snaps).filter((r) => r.platform === "instagram");
    const totals = totalsOf(rows);
    expect(totals.pieces).toBe(2);
    expect(totals.sums).toEqual({ views: 2000, saved: 60, shares: 17, profile_visits: 90, follows: 12 });
    expect(totals.sums.reach).toBeUndefined();
    expect(totals.rates.followPerVisit).toBeCloseTo(12 / 90, 10);
    expect(totals.rates.saveRate).toBeNull(); // 도달 합계가 없다
  });

  it("종별 × 플랫폼 합계", () => {
    const summary = kindSummaries(pieceRows(pieces, snaps));
    expect(summary.map((s) => `${s.kind}:${s.platform}:${s.totals.pieces}`)).toEqual(["post:instagram:1", "pre:instagram:1", "pre:youtube:1"]);
    expect(summary.find((s) => s.kind === "pre" && s.platform === "youtube")?.totals.sums.watch_minutes).toBe(1500);
  });
});

describe("주별 요약", () => {
  const rows = pieceRows(pieces, [
    snap(1, "P-1", "instagram", "2026-11-06", { views: 1200, follows: 9, profile_visits: 60 }),
    snap(2, "A-1", "instagram", "2026-11-06", { views: 800, follows: 3, profile_visits: 30 }),
  ]);

  it("게시 예정 슬롯이 그 주(월~일)에 드는 편만 합친다", () => {
    const [ig, yt] = weekSummaries(pieces, rows, "2026-11-04");
    expect(ig?.weekStart).toBe("2026-11-02");
    expect(ig?.weekEnd).toBe("2026-11-08");
    expect(ig?.totals.pieces).toBe(2);
    expect(ig?.totals.sums.views).toBe(2000);
    expect(ig?.missing).toEqual([]);
    expect(yt?.totals.pieces).toBe(0);
    expect(yt?.missing.map((p) => p.id)).toEqual(["P-1", "A-1"]); // 기본값: 모든 편이 모든 플랫폼에 오를 예정
  });

  it("올릴 예정이 아닌 플랫폼은 「미입력」으로 세지 않는다", () => {
    const [, yt] = weekSummaries(pieces, rows, "2026-11-04", (p, platform) => platform === "instagram" || p.id === "P-1");
    expect(yt?.missing.map((p) => p.id)).toEqual(["P-1"]);
  });

  it("다음 주에는 그 주 편만 — 입력이 없으면 미입력으로 남는다", () => {
    const [ig] = weekSummaries(pieces, rows, "2026-11-12");
    expect(ig?.totals.pieces).toBe(0);
    expect(ig?.missing.map((p) => p.id)).toEqual(["R-1"]);
  });
});
