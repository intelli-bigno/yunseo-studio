import { afterEach, describe, expect, it, vi } from "vitest";
import { exportFileUrl, exportSummary, requestExport } from "./export";

afterEach(() => vi.unstubAllGlobals());

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("exportFileUrl", () => {
  it("판·종류별 주소를 만든다", () => {
    expect(exportFileUrl("R-abc", 7, "video")).toBe("/api/reels/R-abc/export/7/video");
    expect(exportFileUrl("R-abc", 7, "srt", true)).toBe("/api/reels/R-abc/export/7/srt?dl=1");
  });
});

describe("requestExport", () => {
  it("성공 응답을 결과로 바꾼다", async () => {
    const fetchMock = vi.fn(async () => json(200, { revision: 12, video: "/x/R.mp4", srt: "/x/R.srt", durationMs: 24000, probe: { video: { width: 1080, height: 1920, codec: "h264" }, audio: {} }, warnings: ["w"] }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await requestExport("R-abc");
    expect(fetchMock).toHaveBeenCalledWith("/api/reels/R-abc/export", { method: "POST", signal: null });
    expect(out).toEqual({ ok: true, res: { revision: 12, durationMs: 24000, warnings: ["w"], probe: { video: { width: 1080, height: 1920, codec: "h264" }, audio: {} } } });
    if (out.ok) expect(exportSummary(out.res)).toBe("1080x1920 · 24.0초 · 12판");
  });

  it("서버 오류 코드·메시지를 한 줄로 돌려준다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(500, { error: { code: "RENDER_FAILED", message: "원본 파일이 없는 클립: c1" } })));
    expect(await requestExport("R-abc")).toEqual({ ok: false, status: 500, message: "RENDER_FAILED · 원본 파일이 없는 클립: c1" });
  });

  it("연결 실패는 status 0", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fail"))));
    expect(await requestExport("R-abc")).toEqual({ ok: false, status: 0, message: "연결을 확인" });
  });
});

describe("exportSummary", () => {
  it("probe 가 없으면 길이·판만", () => {
    expect(exportSummary({ revision: 3, durationMs: 5500, warnings: [] })).toBe("5.5초 · 3판");
  });
});
