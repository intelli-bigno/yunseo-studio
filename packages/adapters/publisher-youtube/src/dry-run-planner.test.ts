import { describe, expect, it } from "vitest";
import type { BannedExpressionRule, VideoFacts, YoutubeUploadInput } from "@yunseo/domain";
import { createYoutubeDryRunPlanner } from "./dry-run-planner";

const video = (patch: Partial<VideoFacts> = {}): VideoFacts => ({ name: "reel.mp4", container: "mp4", videoCodec: "h264", fps: 30, width: 1080, height: 1920, durationSec: 30, bytes: 20_000_000, ...patch });
const input = (patch: Partial<YoutubeUploadInput> = {}): YoutubeUploadInput => ({
  video: video(),
  title: "다음 사건의 변수",
  description: "설명",
  tags: ["economy", "markets"],
  privacyStatus: "private",
  publishAt: null,
  selfDeclaredMadeForKids: false,
  containsSyntheticMedia: false,
  ...patch,
});
const NOW = "2026-11-05T00:00:00Z";
const planner = createYoutubeDryRunPlanner();
const plan = (i: YoutubeUploadInput = input()) => planner.plan({ platform: "youtube", pieceId: "P-1", kind: "short", input: i, now: NOW });

describe("YouTube 업로드 계획 (스냅샷)", () => {
  it("순서: 동의 범위 → 세션 시작 → 파일 올리기 → 응답 확인 → 공개 전환(사람)", () => {
    const p = plan();
    expect(p.mode).toBe("dry-run");
    expect(p.kind).toBe("yt_short");
    expect(p.steps.map((s) => `${s.order}:${s.id}:${s.kind}:${s.method ?? "-"}`)).toEqual(["1:consent:local:-", "2:session:request:POST", "3:upload:request:PUT", "4:confirm:local:-", "5:human-publish:local:-"]);
    expect(p.steps.map((s) => s.dependsOn)).toEqual([[], ["consent"], ["session"], ["upload"], ["confirm"]]);
  });

  it("세션 시작 요청: 재개 가능 업로드, 비공개, 메타데이터 한도 안의 값", () => {
    const session = plan().steps.find((s) => s.id === "session")!;
    expect(session.url).toBe("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status");
    expect(session.needsAuth).toBe(true);
    expect(session.params).toEqual({
      part: "snippet,status",
      uploadType: "resumable",
      "snippet.title": "다음 사건의 변수",
      "snippet.description": "설명",
      "snippet.tags": ["economy", "markets"],
      "snippet.categoryId": "<CATEGORY_ID: 사람이 정함>",
      "status.privacyStatus": "private",
      "status.selfDeclaredMadeForKids": false,
      "status.containsSyntheticMedia": false,
      "header:X-Upload-Content-Length": 20_000_000,
      "header:X-Upload-Content-Type": "video/mp4",
    });
    const upload = plan().steps.find((s) => s.id === "upload")!;
    expect(upload).toMatchObject({ url: "<SESSION_URI>", params: { "header:Content-Type": "video/mp4", body: "<파일 바이트: reel.mp4>" } });
  });

  it("예상 할당량: 업로드 1단위(하루 100회), 다른 메서드 0", () => {
    const p = plan();
    expect(p.quota.map((q) => [q.label, q.used, q.limit, q.unit])).toEqual([
      ["videos.insert", 1, 100, "회"],
      ["그 밖 메서드 합계", 0, 10_000, "단위"],
    ]);
    expect(p.summary).toBe("영상 30초 · 제목 9자 · 설명 6바이트 · 비공개로 업로드");
    expect(p.issues).toEqual([]);
    expect(p.blocked).toBe(false);
  });

  it("예약 공개: publishAt 이 세션 요청에 들어가고 마지막 단계가 예약 확인으로 바뀐다", () => {
    const p = plan(input({ publishAt: "2026-11-06T12:00:00Z" }));
    expect(p.steps.find((s) => s.id === "session")?.params).toMatchObject({ "status.privacyStatus": "private", "status.publishAt": "2026-11-06T12:00:00Z" });
    expect(p.steps.at(-1)?.title).toBe("예약 공개 확인 (사람)");
    expect(p.summary).toContain("예약 2026-11-06T12:00:00Z");
    expect(p.issues).toEqual([]);
  });

  it("정하지 않은 아동용·합성 표시는 요청에서 빼고 경고로 남긴다", () => {
    const p = plan(input({ selfDeclaredMadeForKids: null, containsSyntheticMedia: null }));
    const params = p.steps.find((s) => s.id === "session")!.params;
    expect(Object.keys(params)).not.toContain("status.selfDeclaredMadeForKids");
    expect(Object.keys(params)).not.toContain("status.containsSyntheticMedia");
    expect(p.issues.map((i) => i.code)).toEqual(["yt_kids_undecided", "yt_synthetic_undecided"]);
    expect(p.blocked).toBe(false);
  });

  it("규격 밖이면 계획은 만들되 blocked — 4분 가로 영상", () => {
    const p = plan(input({ video: video({ durationSec: 240, width: 1920, height: 1080 }) }));
    expect(p.blocked).toBe(true);
    expect(p.issues.map((i) => i.code)).toEqual(["yt_not_short_duration", "yt_not_short_aspect"]);
  });

  it("공개로 올리는 입력은 경고 — 사람 확인 단계를 건너뛴다", () => {
    const p = plan(input({ privacyStatus: "public" }));
    expect(p.issues.map((i) => i.code)).toEqual(["yt_public_without_gate"]);
    expect(p.summary).toContain("public 로 업로드");
  });

  it("MOV 는 video/quicktime", () => {
    const p = plan(input({ video: video({ name: "reel.mov", container: "mov" }) }));
    expect(p.steps.find((s) => s.id === "session")?.params["header:X-Upload-Content-Type"]).toBe("video/quicktime");
  });

  it("금지 표현 규칙을 조립부가 넘기면 제목·설명에 적용한다", () => {
    const rule: BannedExpressionRule = { id: "t-1", terms: ["bannedword"], surfaces: ["body"], severity: "block", origin: "brief", reason: "테스트용 가짜 규칙" };
    const p = createYoutubeDryRunPlanner({ bannedExpressions: [rule] }).plan({ platform: "youtube", pieceId: "P-1", kind: "short", input: input({ title: "bannedword" }), now: NOW });
    expect(p.blocked).toBe(true);
  });

  it("계획 어디에도 토큰이 없다 — 인증은 needsAuth 표시뿐", () => {
    const text = JSON.stringify(plan());
    expect(text).not.toMatch(/Bearer|access_token|refresh_token|client_secret|ya29\./);
    expect(plan().steps.filter((s) => s.needsAuth).map((s) => s.id)).toEqual(["session", "upload"]);
  });
});
