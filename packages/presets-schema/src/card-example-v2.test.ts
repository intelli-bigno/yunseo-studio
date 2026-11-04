import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { findBannedExpressions } from "@yunseo/domain";
import { loadPresets } from "./index";

// docs/design/card-reference/v2 — 카드 템플릿 예시 v2(생성형 사진 배경). 렌더 PNG 의 원본이라 금지 표현·외부 자원·배경 파일을 지킨다.
const v2Dir = fileURLToPath(new URL("../../../docs/design/card-reference/v2/", import.meta.url));
const presetsDir = fileURLToPath(new URL("../../../presets", import.meta.url));

const html = readFileSync(v2Dir + "cards-v2.html", "utf8");

/** 화면에 보이는 글자만 남긴다(스타일·태그 제거, 기본 엔티티 복원). */
function visibleText(source: string): string {
  return source
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&mdash;/g, "-")
    .replace(/&#8209;/g, "-")
    .replace(/\s+/g, " ");
}

describe("카드 템플릿 예시 v2 HTML (pre-issue-5, 8장)", () => {
  const bundle = loadPresets(presetsDir);
  const cards = html.split('<article class="card').slice(1);

  it("표지 + 본문 6 + 출처 = 8장이다 (시나리오 2장 분할)", () => {
    expect(cards).toHaveLength(8);
    expect(bundle.formats.find((f) => f.id === "pre-issue-5")?.cards).toHaveLength(7);
  });

  it("보이는 글자에 금지 표현(block)이 없다", () => {
    const hits = findBannedExpressions(visibleText(html), "body", bundle.bannedExpressions).filter((h) => h.severity === "block");
    expect(hits).toEqual([]);
  });

  it("카드마다 기준 시점·채널명 자리와 SAMPLE 표시가 있다 (게시 불가 예시)", () => {
    for (const card of cards) {
      expect(card).toContain("As of [");
      expect(card).toContain("[Channel TBD]");
      expect(card).toContain("SAMPLE");
    }
  });

  it("스크립트·외부 주소가 없고 배경은 같은 폴더의 파일을 가리킨다", () => {
    expect(html).not.toMatch(/<script|<link|https?:\/\//);
    const bgs = [...html.matchAll(/url\((bg\/[^)]+)\)/g)].map((m) => m[1]);
    expect(bgs).toHaveLength(7);
    for (const bg of bgs) expect(existsSync(v2Dir + bg), bg).toBe(true);
  });

  it("렌더 PNG 8장이 있다", () => {
    for (let n = 1; n <= 8; n += 1) expect(existsSync(`${v2Dir}render/v2-0${n}.png`), `v2-0${n}.png`).toBe(true);
  });
});
