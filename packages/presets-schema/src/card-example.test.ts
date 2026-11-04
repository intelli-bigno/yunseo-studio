import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { findBannedExpressions } from "@yunseo/domain";
import { loadPresets } from "./index";

// docs/design/card-reference/example — 카드 템플릿 예시(정적 HTML). 렌더 PNG 의 원본이라 금지 표현·외부 자원·두 시안 동기화를 지킨다.
const exampleDir = fileURLToPath(new URL("../../../docs/design/card-reference/example/", import.meta.url));
const presetsDir = fileURLToPath(new URL("../../../presets", import.meta.url));

const read = (name: string): string => readFileSync(exampleDir + name, "utf8");

/** 화면에 보이는 글자만 남긴다(스타일·태그 제거, 기본 엔티티 복원). */
function visibleText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8209;/g, "-")
    .replace(/\s+/g, " ");
}

describe("카드 템플릿 예시 HTML (pre-issue-5, 7장)", () => {
  const a = read("cards-a.html");
  const b = read("cards-b.html");
  const bundle = loadPresets(presetsDir);

  it("포맷 ① 의 카드 슬롯 수(표지 + 5단 + 출처 = 7)와 같다", () => {
    const format = bundle.formats.find((f) => f.id === "pre-issue-5");
    expect(format?.cards).toHaveLength(7);
    expect(a.match(/<article class="card"/g)).toHaveLength(7);
  });

  it("보이는 글자에 금지 표현(block)이 없다", () => {
    const hits = findBannedExpressions(visibleText(a), "body", bundle.bannedExpressions).filter((h) => h.severity === "block");
    expect(hits).toEqual([]);
  });

  it("카드마다 기준 시점·채널명 자리와 SAMPLE 표시가 있다 (게시 불가 예시)", () => {
    const cards = a.split('<article class="card"').slice(1);
    for (const card of cards) {
      expect(card).toContain("As of [");
      expect(card).toContain("[Channel TBD]");
      expect(card).toContain("SAMPLE");
    }
  });

  it("스크립트·외부 자원이 없다", () => {
    expect(a).not.toMatch(/<script|<link|https?:\/\//);
  });

  it("A·B 안은 body 클래스와 제목만 다르다", () => {
    expect(b.replace('class="th-b"', 'class="th-a"').replace("visual system B (Signal)", "visual system A (Paper &amp; Ink)")).toBe(a);
  });
});
