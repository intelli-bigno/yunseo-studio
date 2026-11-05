import { describe, expect, it } from "vitest";
import { GRAPH_API_VERSION, INSTAGRAM, SPEC_EVIDENCE, YOUTUBE, evidenceFor } from "./index";

describe("게시 규격 상수 — 2026-11-05 공식 문서 실측", () => {
  it("Instagram: 캐러셀 20개(예전 가정 10개가 아님)·JPEG 만·4:5~1.91:1·8MB", () => {
    expect(INSTAGRAM.carousel.maxItems).toBe(20);
    expect(INSTAGRAM.image.format).toBe("jpeg");
    expect(INSTAGRAM.image.minAspect).toBeCloseTo(0.8, 10);
    expect(INSTAGRAM.image.maxAspect).toBe(1.91);
    expect(INSTAGRAM.image.maxBytes).toBe(8_000_000);
    expect(INSTAGRAM.caption).toEqual({ maxChars: 2200, maxHashtags: 30, maxMentions: 20 });
  });

  it("Instagram: 24시간 게시 한도는 문서끼리 어긋나 낮은 50 을 상한으로 쓴다", () => {
    expect(INSTAGRAM.limits.postsPer24hGuide).toBe(100);
    expect(INSTAGRAM.limits.postsPer24hConservative).toBe(50);
    expect(INSTAGRAM.limits.postsPer24hConservative).toBeLessThanOrEqual(INSTAGRAM.limits.postsPer24hGuide);
    expect(INSTAGRAM.limits.containersPer24h).toBe(400);
  });

  it("YouTube: 업로드는 호출당 1단위·하루 100회(예전 1,600단위 가정이 아님)", () => {
    expect(YOUTUBE.quota.insertCostUnits).toBe(1);
    expect(YOUTUBE.quota.insertPerDay).toBe(100);
    expect(YOUTUBE.quota.otherUnitsPerDay).toBe(10_000);
    expect(YOUTUBE.shorts.maxDurationSec).toBe(180);
  });

  it("Graph API 버전은 문서의 latest 표기", () => {
    expect(GRAPH_API_VERSION).toMatch(/^v\d+\.\d+$/);
  });
});

describe("근거 목록 (evidence)", () => {
  it("모든 항목에 공개 문서 주소·확인일·원문 인용이 있다", () => {
    expect(SPEC_EVIDENCE.length).toBeGreaterThanOrEqual(15);
    for (const e of SPEC_EVIDENCE) {
      expect(e.url, e.id).toMatch(/^https:\/\/(developers\.facebook\.com|developers\.google\.com|support\.google\.com)\//);
      expect(e.checkedAt, e.id).toBe("2026-11-05");
      expect(e.quote.length, e.id).toBeGreaterThan(20);
      expect(e.finding.length, e.id).toBeGreaterThan(10);
    }
  });

  it("id 는 유일하고, 두 플랫폼 모두 근거가 있다", () => {
    const ids = SPEC_EVIDENCE.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(evidenceFor("instagram").length).toBeGreaterThan(0);
    expect(evidenceFor("youtube").length).toBeGreaterThan(0);
  });

  it("바뀐 값은 상수에 반영돼 있다 — 캐러셀 20·업로드 1단위", () => {
    expect(SPEC_EVIDENCE.find((e) => e.id === "ig-carousel-max")?.quote).toContain("20");
    expect(SPEC_EVIDENCE.find((e) => e.id === "yt-upload-quota")?.quote).toContain("100 videos.insert calls");
  });

  it("충돌한 항목은 낮은 값을 쓴다고 밝힌다", () => {
    const conflict = SPEC_EVIDENCE.filter((e) => e.verdict === "conflict");
    expect(conflict.length).toBeGreaterThanOrEqual(1);
    expect(conflict[0]?.finding).toContain("50");
  });
});
