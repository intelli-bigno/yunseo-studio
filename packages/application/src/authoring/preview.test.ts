import { describe, expect, it } from "vitest";
import { NO_PREVIEW, previewOf } from "./preview";
import type { PipelineRecord } from "./ports";

const file = (name: string) => ({ name, path: name, bytes: 1, sha256: "x" });
const rec = (over: Partial<PipelineRecord> = {}): PipelineRecord => ({
  pieceId: "P-1",
  contentHash: "h1",
  render: { pieceId: "P-1", cards: [file("1.png"), file("2.png"), file("3.png")], caption: "", hashtags: [], altTexts: ["표지", "본문"], warnings: [] },
  reel: null,
  bundle: null,
  updatedAt: "2026-11-07T10:00",
  ...over,
});

describe("목록 미리보기 — 기록 하나 읽기", () => {
  it("기록이 없으면 비어 있다", () => {
    expect(previewOf(null, "h1")).toEqual(NO_PREVIEW);
  });

  it("해시가 다르면(내용이 바뀐 낡은 산출물) 비어 있다", () => {
    expect(previewOf(rec(), "h2")).toEqual(NO_PREVIEW);
  });

  it("지금 내용의 기록이면 카드 수·대체 텍스트를 돌려준다(모자란 대체 텍스트는 빈 문자열)", () => {
    expect(previewOf(rec(), "h1")).toEqual({ cards: 3, alts: ["표지", "본문", ""], reel: false });
  });

  it("릴스가 있으면 reel 이 참", () => {
    const reel = { pieceId: "P-1", video: file("r.mp4"), durationSec: 10, subtitles: null, warnings: [] };
    expect(previewOf(rec({ reel }), "h1").reel).toBe(true);
  });

  it("렌더 없이 기록만 있으면 카드 0", () => {
    expect(previewOf(rec({ render: null }), "h1")).toEqual({ cards: 0, alts: [], reel: false });
  });
});
