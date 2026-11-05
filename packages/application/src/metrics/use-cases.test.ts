import { describe, expect, it } from "vitest";
import type { ColumnTarget, QueueItem } from "@yunseo/domain";
import { FakeRepository, piece } from "../fakes";
import { FakeMetricsRepository } from "./fakes";
import { createMetricsUseCases } from "./use-cases";

// 열 제목은 공식 지표 이름(Instagram 미디어 인사이트) — 근거는 docs/05 §5.8. 값은 가짜다.
const IG_CSV = [
  "permalink,views,reach,likes,comments,saved,shares,profile_visits,follows",
  "https://www.instagram.com/p/AAA111/?utm_source=x,1200,900,80,6,45,12,60,9",
  "https://www.instagram.com/p/BBB222/,800,610,40,2,15,5,30,3",
  "https://www.instagram.com/p/ZZZ999/,10,10,1,0,0,0,0,0",
].join("\n");

const queue = (pieceId: string, channel: QueueItem["channel"], postedUrl: string | null): QueueItem => ({ pieceId, channel, approvedHash: "h", currentHash: "h", postedUrl });

function setup() {
  const repo = new FakeRepository(
    [
      piece("P-1104", { kind: "pre", title: "다음 사건의 변수, 정리", slot: "2026-11-04T21:00" }),
      piece("A-1102", { kind: "post", title: "두 번째 편", slot: "2026-11-05T21:00" }),
      piece("P-1103", { kind: "pre", title: "세 번째 편", slot: "2026-11-06T21:00" }),
    ],
    [queue("P-1104", "feed", "https://www.instagram.com/p/AAA111/"), queue("A-1102", "feed", "https://www.instagram.com/p/BBB222/"), queue("P-1103", "reels", null)],
  );
  const metrics = new FakeMetricsRepository();
  const uc = createMetricsUseCases({ repo, metrics, clock: { today: () => "2026-11-08" } });
  return { uc, metrics };
}

describe("수동 입력", () => {
  it("쉼표·빈 칸·다른 플랫폼 칸을 정리해 저장한다", async () => {
    const { uc, metrics } = setup();
    const r = await uc.recordManual({ pieceId: "P-1104", platform: "instagram", capturedAt: "2026-11-07", values: { views: "1,200", reach: "900", saved: "45", likes: "", watch_minutes: "9" }, note: " 1주차 " });
    expect(r).toEqual({ ok: true, id: "1" });
    expect(metrics.snapshots[0]).toMatchObject({ pieceId: "P-1104", platform: "instagram", capturedAt: "2026-11-07", source: "manual", values: { views: 1200, reach: 900, saved: 45 }, note: "1주차" });
  });

  it("YouTube 평균 시청은 m:ss 로도 입력한다", async () => {
    const { uc, metrics } = setup();
    await uc.recordManual({ pieceId: "P-1103", platform: "youtube", capturedAt: "2026-11-07", values: { views: "300", avg_view_sec: "0:18", avg_view_percent: "72.5" }, note: "" });
    expect(metrics.snapshots[0]?.values).toEqual({ views: 300, avg_view_sec: 18, avg_view_percent: 72.5 });
  });

  it("같은 날 같은 출처는 덮어쓴다", async () => {
    const { uc, metrics } = setup();
    const base = { pieceId: "P-1104", platform: "instagram", capturedAt: "2026-11-07", note: "" } as const;
    await uc.recordManual({ ...base, values: { views: "10" } });
    await uc.recordManual({ ...base, values: { views: "20" } });
    expect(metrics.snapshots).toHaveLength(1);
    expect(metrics.snapshots[0]?.values.views).toBe(20);
  });

  it("없는 편·미래 날짜·잘못된 날짜·읽을 수 없는 값·음수·빈 입력을 막는다", async () => {
    const { uc, metrics } = setup();
    const ok = { pieceId: "P-1104", platform: "instagram", capturedAt: "2026-11-07", note: "", values: { views: "1" } } as const;
    expect(await uc.recordManual({ ...ok, pieceId: "NOPE" })).toEqual({ ok: false, errors: ["편을 찾을 수 없다"] });
    expect(await uc.recordManual({ ...ok, capturedAt: "2026-11-09" })).toEqual({ ok: false, errors: ["측정 기준일이 오늘보다 미래다"] });
    expect(await uc.recordManual({ ...ok, capturedAt: "11/07" })).toEqual({ ok: false, errors: ["측정 기준일은 YYYY-MM-DD 형식이어야 한다"] });
    expect(await uc.recordManual({ ...ok, capturedAt: "2026-02-30" })).toEqual({ ok: false, errors: ["측정 기준일은 YYYY-MM-DD 형식이어야 한다"] });
    expect(await uc.recordManual({ ...ok, values: { views: "abc" } })).toMatchObject({ ok: false, errors: expect.arrayContaining(["조회: 숫자를 읽을 수 없다 (「abc」)"]) });
    expect(await uc.recordManual({ ...ok, values: { views: "-5" } })).toEqual({ ok: false, errors: ["조회: 음수일 수 없다"] });
    expect(await uc.recordManual({ ...ok, values: { views: "1.5" } })).toEqual({ ok: false, errors: ["조회: 정수여야 한다"] });
    expect(await uc.recordManual({ ...ok, values: {} })).toEqual({ ok: false, errors: ["입력된 지표가 없다"] });
    expect(await uc.recordManual({ ...ok, note: "가".repeat(501) })).toEqual({ ok: false, errors: ["메모는 500자 이하여야 한다"] });
    expect(metrics.snapshots).toHaveLength(0);
  });
});

describe("CSV 미리보기·가져오기", () => {
  it("미리보기: 열 추정·들어갈 행·못 찾은 행을 저장 없이 보여 준다", async () => {
    const { uc, metrics } = setup();
    const r = await uc.previewCsv({ platform: "instagram", text: IG_CSV });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const p = r.preview;
    expect(p.headers).toHaveLength(9);
    expect(p.rowCount).toBe(3);
    expect(p.sampleRows).toHaveLength(3);
    expect(p.mapping).toEqual(["postUrl", "views", "reach", "likes", "comments", "saved", "shares", "profile_visits", "follows"]);
    expect(p.restored).toBe(false);
    expect(p.matched).toBe(2);
    expect(p.unmatched.map((u) => u.rowNumber)).toEqual([4]);
    expect(p.blockers).toEqual([]);
    expect(p.capturedAt).toBe("2026-11-08");
    expect(metrics.snapshots).toHaveLength(0);
  });

  it("가져오기: 저장·매핑 기억·기록. 같은 파일을 다시 넣어도 쌓이지 않고, 다음 미리보기는 기억한 매핑을 쓴다", async () => {
    const { uc, metrics } = setup();
    const mapping = ["postUrl", "views", "reach", "likes", "comments", "saved", "shares", "profile_visits", "follows"] as ColumnTarget[];
    const r = await uc.importCsv({ platform: "instagram", text: IG_CSV, mapping, capturedAt: "2026-11-07" });
    expect(r).toMatchObject({ ok: true, imported: 2 });
    if (r.ok) expect(r.unmatched).toHaveLength(1);
    expect(metrics.snapshots).toHaveLength(2);
    expect(metrics.imports[0]).toMatchObject({ platform: "instagram", capturedAt: "2026-11-07", rows: 3, imported: 2, unmatched: 1, skipped: 0 });

    await uc.importCsv({ platform: "instagram", text: IG_CSV, mapping, capturedAt: "2026-11-07" });
    expect(metrics.snapshots).toHaveLength(2);

    // 사람이 매핑을 바꿨던 파일 모양은 다음에 그대로 돌아온다
    const changed = [...mapping];
    changed[3] = "ignore"; // likes 열을 가져오지 않기로
    await uc.importCsv({ platform: "instagram", text: IG_CSV, mapping: changed, capturedAt: "2026-11-07" });
    const again = await uc.previewCsv({ platform: "instagram", text: IG_CSV });
    expect(again.ok && again.preview.restored).toBe(true);
    expect(again.ok && again.preview.mapping[3]).toBe("ignore");
  });

  it("막는 경우: 편 찾을 열 없음·지표 열 없음·열 수 불일치·다른 플랫폼 지표·같은 대상 두 열·미래 날짜", async () => {
    const { uc } = setup();
    const blockers = async (text: string, mapping: ColumnTarget[] | undefined, platform: "instagram" | "youtube" = "instagram", capturedAt?: string) => {
      const r = await uc.previewCsv({ platform, text, ...(mapping ? { mapping } : {}), ...(capturedAt ? { capturedAt } : {}) });
      return r.ok ? r.preview.blockers : r.errors;
    };
    expect(await blockers("views,reach\n1,2", undefined)).toEqual(["편을 찾을 열(편 ID·게시 주소·제목) 이 하나는 있어야 한다"]);
    expect(await blockers("title,note\nx,y", undefined)).toEqual(["지표 열이 하나는 있어야 한다"]);
    expect(await blockers("title,views\nx,1", ["title"])).toContain("매핑 열 수가 CSV 열 수와 다르다");
    expect(await blockers("title,saved\nx,1", ["title", "saved"], "youtube")).toContain("saved: 저장 는 youtube 지표가 아니다");
    expect(await blockers("title,a,b\nx,1,2", ["title", "views", "views"])).toContain("views 가 두 열에 걸려 있다");
    expect(await blockers("title,views\nx,1", undefined, "instagram", "2026-11-09")).toContain("측정 기준일이 오늘보다 미래다");
  });

  it("입력 보호: 머리글만 있는 파일·1MB 초과·2,000행 초과", async () => {
    const { uc } = setup();
    expect(await uc.previewCsv({ platform: "instagram", text: "title,views" })).toEqual({ ok: false, errors: ["CSV 에 머리글과 데이터 행이 있어야 한다"] });
    expect(await uc.previewCsv({ platform: "instagram", text: `title,views\n${"x".repeat(1_000_001)}` })).toEqual({ ok: false, errors: ["CSV 가 너무 크다(1MB 이하)"] });
    const rows = Array.from({ length: 2001 }, (_, i) => `t${i},1`).join("\n");
    expect(await uc.previewCsv({ platform: "instagram", text: `title,views\n${rows}` })).toEqual({ ok: false, errors: ["행이 너무 많다(2000행 이하)"] });
  });

  it("YouTube 공식 이름 파일의 영상 열은 몰라서 사람이 편 ID 로 정하면 가져온다", async () => {
    const { uc, metrics } = setup();
    const csv = "video,views,estimatedMinutesWatched,averageViewDuration\nP-1103,5000,1500,0:18\nV-9,1,1,0:01";
    const mapping: ColumnTarget[] = ["pieceId", "views", "watch_minutes", "avg_view_sec"];
    const r = await uc.importCsv({ platform: "youtube", text: csv, mapping, capturedAt: "2026-11-07" });
    expect(r).toMatchObject({ ok: true, imported: 1 });
    expect(metrics.snapshots[0]?.values).toEqual({ views: 5000, watch_minutes: 1500, avg_view_sec: 18 });
  });
});

describe("성과 화면 읽기 모델", () => {
  it("편별 표·종별 합계·주별 요약(이번 주 편 중 입력이 없는 편은 미입력)", async () => {
    const { uc } = setup();
    const mapping = ["postUrl", "views", "reach", "likes", "comments", "saved", "shares", "profile_visits", "follows"] as ColumnTarget[];
    await uc.importCsv({ platform: "instagram", text: IG_CSV, mapping, capturedAt: "2026-11-07" });
    await uc.recordManual({ pieceId: "P-1103", platform: "youtube", capturedAt: "2026-11-07", values: { views: "300", watch_minutes: "90" }, note: "" });

    const v = await uc.getPerformance();
    expect(v.today).toBe("2026-11-08");
    expect(v.weekStart).toBe("2026-11-02"); // 11/8 은 일요일 — 그 주의 월요일
    expect(v.weekEnd).toBe("2026-11-08");
    expect(v.snapshotCount).toBe(3);
    expect(v.rows.map((r) => `${r.piece.id}:${r.platform}`)).toEqual(["P-1103:youtube", "A-1102:instagram", "P-1104:instagram"]);
    expect(v.pieces.map((p) => p.id)).toEqual(["P-1103", "A-1102", "P-1104"]);
    expect(v.imports).toHaveLength(1);
    expect(v.recent.map((s) => s.id)).toEqual(["3", "2", "1"]); // 측정일 내림차순(전부 11/7) 안에서 나중 입력 먼저

    const [ig, yt] = v.week;
    expect(ig?.platform).toBe("instagram");
    expect(ig?.totals.pieces).toBe(2);
    expect(ig?.totals.sums).toMatchObject({ views: 2000, saved: 60, follows: 12 });
    expect(ig?.missing.map((p) => p.id)).toEqual(["P-1103"]); // 릴스 편은 IG 에도 올라가는데 IG 값이 없다
    expect(yt?.totals.sums.watch_minutes).toBe(90);
    expect(yt?.missing).toEqual([]); // 피드 편(P-1104·A-1102)은 YouTube 예정이 아니다

    expect(v.kinds.map((k) => `${k.kind}:${k.platform}:${k.totals.pieces}`)).toEqual(["post:instagram:1", "pre:instagram:1", "pre:youtube:1"]);
  });

  it("다른 주를 고르면 그 주의 편만 본다", async () => {
    const { uc } = setup();
    const v = await uc.getPerformance("2026-11-12");
    expect(v.weekStart).toBe("2026-11-09");
    expect(v.week.every((w) => w.totals.pieces === 0 && w.missing.length === 0)).toBe(true);
  });

  it("스냅샷 삭제", async () => {
    const { uc, metrics } = setup();
    await uc.recordManual({ pieceId: "P-1104", platform: "instagram", capturedAt: "2026-11-07", values: { views: "1" }, note: "" });
    expect(await uc.deleteSnapshot("1")).toBe(true);
    expect(await uc.deleteSnapshot("1")).toBe(false);
    expect(metrics.snapshots).toHaveLength(0);
  });
});

// 열 제목 추정에 쓰는 파일 모양 두 가지가 가져오기 전체 길을 지나는지 — GUESSED(사람이 읽는 제목)는 근거가 없으므로 미리보기에서 사람이 확인한다.
describe("추정 제목 파일", () => {
  it("사람이 읽는 제목(추정)도 미리보기 매핑이 나오고, 확인 뒤 가져온다", async () => {
    const { uc, metrics } = setup();
    const csv = "제목,조회수,도달,저장\n다음 사건의 변수 정리,\"1,200\",900,45\n두 번째 편,800,610,15";
    const r = await uc.previewCsv({ platform: "instagram", text: csv });
    expect(r.ok && r.preview.mapping).toEqual(["title", "views", "reach", "saved"]);
    expect(r.ok && r.preview.suggestions.every((s) => s.basis === "guess")).toBe(true);
    if (!r.ok) return;
    const done = await uc.importCsv({ platform: "instagram", text: csv, mapping: r.preview.mapping });
    expect(done).toMatchObject({ ok: true, imported: 2 });
    expect(metrics.snapshots.map((s) => s.pieceId)).toEqual(["P-1104", "A-1102"]);
  });
});
