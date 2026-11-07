// 수집 레퍼런스 그림 프록시 — 목록에 있는 i.pinimg.com 그림만 원본 주소를 준다(임의 주소 중계 금지)
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { listReferences, referenceImageUrl } from "./library";

const rows = JSON.parse(readFileSync(resolve(__dirname, "../../../../docs/design/card-reference/refs.json"), "utf8")) as { id: string; thumb: string }[];

describe("referenceImageUrl", () => {
  it("수집 목록의 id 는 자기 pinimg 주소를 돌려준다", () => {
    expect(rows.length).toBeGreaterThanOrEqual(100);
    for (const r of rows) expect(referenceImageUrl(r.id), r.id).toBe(r.thumb);
  });

  it("목록에 없는 id·경로 흉내·저장소 캡처는 null", () => {
    expect(referenceImageUrl("nope")).toBeNull();
    expect(referenceImageUrl("../../etc/passwd")).toBeNull();
    expect(referenceImageUrl("")).toBeNull();
    expect(referenceImageUrl("card-01")).toBeNull(); // 저장소 안 캡처는 /api/refs 가 준다
  });

  it("편집기에 줄 수 있는 레퍼런스는 캡처 + 수집분 전부", () => {
    const all = listReferences();
    expect(all.length).toBeGreaterThanOrEqual(rows.length + 9);
    expect(all.every((r) => r.thumb.startsWith("/api/") || referenceImageUrl(r.id) === r.thumb)).toBe(true);
  });
});
