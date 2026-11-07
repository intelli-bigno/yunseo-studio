// 레퍼런스 수집 목록(docs/design/card-reference/refs.json) 모양 검사 — 대시보드 /references 가 읽는 데이터
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

interface Row {
  id: string;
  set: string;
  source: string;
  title: string;
  takeaway: string;
  tags: string[];
  thumb: string;
  href: string;
  account: string;
  by: string;
  pin: string;
}

const file = resolve(__dirname, "../../../../docs/design/card-reference/refs.json");
const rows = JSON.parse(readFileSync(file, "utf8")) as Row[];

describe("레퍼런스 수집 목록(refs.json)", () => {
  it("100장 이상이고 id 가 겹치지 않는다", () => {
    expect(rows.length).toBeGreaterThanOrEqual(100);
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
  });

  it("같은 그림·같은 출처가 두 번 들어가지 않는다", () => {
    expect(new Set(rows.map((r) => r.thumb)).size).toBe(rows.length);
    expect(new Set(rows.map((r) => r.href)).size).toBe(rows.length);
  });

  it("모든 줄에 https 그림·출처 주소와 묶음·태그가 있다", () => {
    for (const r of rows) {
      expect(r.thumb, r.id).toMatch(/^https:\/\/i\.pinimg\.com\//);
      expect(r.href, r.id).toMatch(/^https:\/\//);
      expect(r.pin, r.id).toMatch(/^https:\/\/www\.pinterest\.com\/pin\/\d+\/$/);
      expect(r.set, r.id).not.toBe("");
      expect(r.tags.length, r.id).toBeGreaterThan(0);
      expect(["instagram", "pinterest"], r.id).toContain(r.source);
    }
  });

  it("출처가 instagram 인 줄은 인스타 게시물 주소를 가리킨다", () => {
    for (const r of rows.filter((x) => x.source === "instagram")) expect(r.href, r.id).toMatch(/^https:\/\/www\.instagram\.com\/(p|reel)\//);
  });
});
