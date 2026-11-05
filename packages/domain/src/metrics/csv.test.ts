import { describe, expect, it } from "vitest";
import { GUESSED_INSTAGRAM_CSV, GUESSED_YOUTUBE_CSV, OFFICIAL_INSTAGRAM_CSV, OFFICIAL_YOUTUBE_CSV } from "./csv-fixtures";
import { guessWatchUnit, headerSignature, matchPiece, parseMetricsCsv, parseMetricDate, parseMetricDuration, parseMetricNumber, rowsToSnapshots, suggestMapping } from "./csv";
import type { PieceIndexEntry } from "./csv";

describe("parseMetricsCsv", () => {
  it("따옴표 안의 쉼표·줄바꿈·이중 따옴표를 읽는다", () => {
    const t = parseMetricsCsv('a,b,c\r\n1,"x, y","line1\nline2"\r\n2,"say ""hi""",z\r\n');
    expect(t.headers).toEqual(["a", "b", "c"]);
    expect(t.rows).toEqual([["1", "x, y", "line1\nline2"], ["2", 'say "hi"', "z"]]);
  });

  it("BOM 제거·세미콜론 구분자·빈 줄 건너뛰기", () => {
    const t = parseMetricsCsv(GUESSED_INSTAGRAM_CSV);
    expect(t.headers[0]).toBe("게시물 링크");
    expect(t.headers).toHaveLength(11);
    expect(t.rows).toHaveLength(2);
    expect(parseMetricsCsv("a\tb\n1\t2\n\n\n3\t4").rows).toEqual([["1", "2"], ["3", "4"]]);
  });

  it("빈 입력은 머리글도 행도 없다", () => {
    expect(parseMetricsCsv("")).toEqual({ headers: [], rows: [] });
  });
});

describe("값 읽기", () => {
  it("숫자: 천 단위 쉼표·퍼센트·K/M 접미사·빈 값·읽을 수 없는 값", () => {
    expect(parseMetricNumber("1,234")).toBe(1234);
    expect(parseMetricNumber("12.5%")).toBe(12.5);
    expect(parseMetricNumber("1.2K")).toBe(1200);
    expect(parseMetricNumber("3M")).toBe(3_000_000);
    expect(parseMetricNumber("")).toBeNull();
    expect(parseMetricNumber("-")).toBeNull();
    expect(parseMetricNumber("—")).toBeNull();
    expect(parseMetricNumber("abc")).toBeNaN();
  });

  it("시간: 초·m:ss·h:mm:ss", () => {
    expect(parseMetricDuration("45")).toBe(45);
    expect(parseMetricDuration("0:45")).toBe(45);
    expect(parseMetricDuration("1:02:03")).toBe(3723);
    expect(parseMetricDuration("")).toBeNull();
    expect(parseMetricDuration("x:y")).toBeNaN();
  });

  it("날짜: ISO·점 구분·슬래시·시각 붙은 ISO", () => {
    expect(parseMetricDate("2026-11-04")).toBe("2026-11-04");
    expect(parseMetricDate("2026.11.5.")).toBe("2026-11-05");
    expect(parseMetricDate("2026/1/2")).toBe("2026-01-02");
    expect(parseMetricDate("2026-11-04T09:30:00Z")).toBe("2026-11-04");
    expect(parseMetricDate("Nov 4")).toBeNull();
    expect(parseMetricDate("2026-13-01")).toBeNull();
    expect(parseMetricDate("2026-02-30")).toBeNull(); // 달마다 날 수가 다르다
    expect(parseMetricDate("2028-02-29")).toBe("2028-02-29"); // 윤년
  });

  it("시청 시간 단위 추정", () => {
    expect(guessWatchUnit("Watch time (hours)")).toBe("hours");
    expect(guessWatchUnit("시청 시간(분)")).toBe("minutes");
    expect(guessWatchUnit("estimatedMinutesWatched")).toBe("minutes");
  });
});

describe("열 추정", () => {
  it("공식 지표 이름은 official 로 맞춘다 (Instagram)", () => {
    const { headers } = parseMetricsCsv(OFFICIAL_INSTAGRAM_CSV);
    const s = suggestMapping(headers, "instagram");
    expect(s.map((x) => x.target)).toEqual(["postUrl", "views", "reach", "likes", "comments", "saved", "shares", "profile_visits", "follows", "total_interactions"]);
    expect(s[0]?.basis).toBe("guess"); // permalink 는 지표 이름이 아니라 추정
    expect(s.slice(1).every((x) => x.basis === "official")).toBe(true);
  });

  it("공식 지표 이름은 official 로 맞춘다 (YouTube Analytics)", () => {
    const { headers } = parseMetricsCsv(OFFICIAL_YOUTUBE_CSV);
    const s = suggestMapping(headers, "youtube");
    expect(s.map((x) => x.target)).toEqual(["ignore", "views", "engaged_views", "watch_minutes", "avg_view_sec", "avg_view_percent", "likes", "comments", "shares", "subscribers_gained", "subscribers_lost"]);
    expect(s[0]).toEqual({ target: "ignore", basis: "none" }); // video(ID) 열은 몰라서 사람이 고른다
  });

  it("사람이 읽는 제목은 guess — 근거 없음으로 표시", () => {
    const ig = suggestMapping(parseMetricsCsv(GUESSED_INSTAGRAM_CSV).headers, "instagram");
    expect(ig.map((x) => x.target)).toEqual(["postUrl", "title", "publishedAt", "views", "reach", "likes", "comments", "saved", "shares", "profile_visits", "follows"]);
    expect(ig.every((x) => x.basis === "guess" || x.basis === "official")).toBe(true);
    const yt = suggestMapping(parseMetricsCsv(GUESSED_YOUTUBE_CSV).headers, "youtube");
    expect(yt.map((x) => x.target)).toEqual(["ignore", "title", "publishedAt", "views", "watch_minutes", "avg_view_sec", "subscribers_gained", "impressions", "impressions_ctr_percent"]);
  });

  it("다른 플랫폼의 지표 열은 무시하고, 같은 대상이 두 열이면 첫 열만 쓴다", () => {
    expect(suggestMapping(["saved", "views"], "youtube").map((x) => x.target)).toEqual(["ignore", "views"]);
    expect(suggestMapping(["views", "조회수"], "instagram").map((x) => x.target)).toEqual(["views", "ignore"]);
  });

  it("서명은 열 제목의 모양 — 대소문자·공백이 달라도 같다", () => {
    expect(headerSignature(["Views", "Watch time (hours)"])).toBe(headerSignature(["views ", "watch_time_hours"]));
  });
});

describe("편 찾기", () => {
  const index: PieceIndexEntry[] = [
    { id: "P-1104", title: "다음 사건의 변수, 정리", postedUrls: ["https://www.instagram.com/p/AAA111/"] },
    { id: "A-1102", title: "두 번째 편", postedUrls: [] },
    { id: "A-1103", title: "두번째 편!", postedUrls: [] },
  ];

  it("편 ID → 게시 주소(쿼리·www·끝 슬래시 무시) → 제목(공백·문장부호 무시) 순서", () => {
    expect(matchPiece({ pieceId: "A-1102", postUrl: null, title: null }, index)).toBe("A-1102");
    expect(matchPiece({ pieceId: null, postUrl: "http://instagram.com/p/AAA111?igsh=x", title: null }, index)).toBe("P-1104");
    expect(matchPiece({ pieceId: null, postUrl: null, title: "다음 사건의 변수 정리" }, index)).toBe("P-1104");
  });

  it("못 찾거나 제목이 둘 이상에 겹치면 null", () => {
    expect(matchPiece({ pieceId: "NOPE", postUrl: null, title: null }, index)).toBeNull();
    expect(matchPiece({ pieceId: null, postUrl: null, title: "두 번째 편" }, index)).toBeNull(); // 「두 번째 편」·「두번째 편!」 둘 다 맞는다
    expect(matchPiece({ pieceId: null, postUrl: null, title: "   " }, index)).toBeNull();
  });
});

describe("행 → 스냅샷", () => {
  const index: PieceIndexEntry[] = [
    { id: "P-1104", title: "다음 사건의 변수, 정리", postedUrls: ["https://www.instagram.com/p/AAA111/"] },
    { id: "A-1102", title: "두 번째 편", postedUrls: ["https://www.instagram.com/p/BBB222/"] },
    { id: "Y-1", title: "다음 사건의 변수 (Shorts)", postedUrls: [] },
  ];
  const run = (csv: string, platform: "instagram" | "youtube", mapping?: Parameters<typeof rowsToSnapshots>[0]["mapping"], watchUnit: "minutes" | "hours" | "seconds" = "minutes") => {
    const table = parseMetricsCsv(csv);
    return rowsToSnapshots({ table, mapping: mapping ?? suggestMapping(table.headers, platform).map((s) => s.target), platform, capturedAt: "2026-11-08", watchUnit, index });
  };

  it("공식 이름 Instagram 파일: 게시 주소로 편을 찾고, 못 찾은 행은 unmatched", () => {
    const r = run(OFFICIAL_INSTAGRAM_CSV, "instagram");
    expect(r.snapshots).toHaveLength(2);
    expect(r.snapshots[0]).toEqual({
      pieceId: "P-1104",
      platform: "instagram",
      capturedAt: "2026-11-08",
      source: "csv",
      values: { views: 1200, reach: 900, likes: 80, comments: 6, saved: 45, shares: 12, profile_visits: 60, follows: 9, total_interactions: 143 },
      note: "CSV 2행",
    });
    expect(r.snapshots[1]?.pieceId).toBe("A-1102");
    expect(r.unmatched).toEqual([{ rowNumber: 4, label: "https://www.instagram.com/p/ZZZ999/", reason: "대응하는 편을 찾지 못했다 (편 ID·게시 주소·제목이 맞는지 확인)" }]);
    expect(r.skipped).toEqual([]);
  });

  it("추정 제목 Instagram 파일: 천 단위 쉼표·빈 칸·「-」는 값 없음으로 건너뛴다", () => {
    const r = run(GUESSED_INSTAGRAM_CSV, "instagram");
    expect(r.snapshots).toHaveLength(2);
    expect(r.snapshots[0]?.values.views).toBe(1200);
    // 둘째 줄은 주소가 비어 제목으로 찾고, 조회 「-」·댓글 빈 칸은 빠진다
    expect(r.snapshots[1]).toMatchObject({ pieceId: "A-1102", values: { reach: 610, likes: 40, saved: 15, shares: 5, profile_visits: 30, follows: 3 } });
    expect(r.snapshots[1]?.values.views).toBeUndefined();
    expect(r.snapshots[1]?.values.comments).toBeUndefined();
  });

  it("YouTube 공식 이름 파일: 영상 열을 사람이 편 ID 로 매핑하면 가져온다", () => {
    const table = parseMetricsCsv(OFFICIAL_YOUTUBE_CSV);
    const mapping = suggestMapping(table.headers, "youtube").map((s) => s.target);
    mapping[0] = "pieceId"; // 사람이 고른 매핑
    const r = rowsToSnapshots({ table, mapping, platform: "youtube", capturedAt: "2026-11-08", watchUnit: "minutes", index: [{ id: "V-1", title: "x", postedUrls: [] }] });
    expect(r.snapshots).toHaveLength(1);
    expect(r.snapshots[0]?.values).toEqual({ views: 5000, engaged_views: 4200, watch_minutes: 1500.5, avg_view_sec: 18, avg_view_percent: 72.5, likes: 300, comments: 20, shares: 41, subscribers_gained: 25, subscribers_lost: 2 });
    expect(r.unmatched.map((u) => u.label)).toEqual(["V-2"]);
  });

  it("YouTube 추정 제목 파일: 시청 시간(시간)→분 환산, h:mm:ss 평균 시청", () => {
    const r = run(GUESSED_YOUTUBE_CSV, "youtube", undefined, "hours");
    expect(r.snapshots).toHaveLength(1);
    expect(r.snapshots[0]).toMatchObject({ pieceId: "Y-1", values: { views: 5000, watch_minutes: 1530, avg_view_sec: 18, subscribers_gained: 25, impressions: 20000, impressions_ctr_percent: 4.2 } });
    expect(r.unmatched.map((u) => u.label)).toEqual(["알 수 없는 영상"]);
  });

  it("읽을 수 없는 값이 있는 행·지표가 없는 행은 skipped 로 이유를 남긴다", () => {
    const r = run("title,views,reach\n두 번째 편,abc,10\n두 번째 편,,\n", "instagram");
    expect(r.snapshots).toEqual([]);
    expect(r.skipped).toEqual([
      { rowNumber: 2, label: "두 번째 편", reason: "읽을 수 없는 값: 조회 「abc」" },
      { rowNumber: 3, label: "두 번째 편", reason: "가져올 지표 값이 없다" },
    ]);
  });

  it("횟수 지표는 정수로 반올림해 저장한다", () => {
    const r = run("title,views\n두 번째 편,1.5K\n", "instagram");
    expect(r.snapshots[0]?.values.views).toBe(1500);
    const r2 = run("title,views\n두 번째 편,10.6\n", "instagram");
    expect(r2.snapshots[0]?.values.views).toBe(11);
  });
});
