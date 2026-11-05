import { describe, expect, it } from "vitest";
import type { BannedExpressionRule } from "../compliance/expressions";
import { validateContentDoc, type ContentBody } from "./document";
import { postIssueInput, preIssueInput, researchInput, sourcedFact } from "./fixtures";
import { CAPTION_MAX_CHARS, HASHTAG_MAX, buildHashtags, buildPublishText, publishTextFindings, publishersOf, tagify } from "./publish-text";

function body(input: unknown): ContentBody {
  const result = validateContentDoc(input);
  if (!result.ok) throw new Error(result.errors.join("\n"));
  return result.value;
}

const rules: BannedExpressionRule[] = [{ id: "free", terms: ["무료"], surfaces: ["body"], severity: "block", origin: "brief", reason: "t" }];

describe("tagify", () => {
  it("단어를 붙이고 글자·숫자만 남긴다", () => {
    expect(tagify("US midterm elections")).toBe("USMidtermElections");
    expect(tagify("Writing down your baseline — before an event!")).toBe("WritingDownYourBaselineBeforeAnEvent");
    expect(tagify("시장 복기")).toBe("시장복기");
    expect(tagify("**bold** tag")).toBe("BoldTag");
  });
});

describe("buildPublishText", () => {
  const options = { cardCount: 8 };

  it("캡션에 제목·기준 시점·출처 안내·투자 권유 아님 고지가 들어간다", () => {
    const withSource = preIssueInput({ as_of: "2026-01-02T09:30:00+09:00", claims: [sourcedFact] });
    const { caption, warnings } = buildPublishText(body(withSource), options);
    expect(caption).toContain("A title");
    expect(caption).toContain("As of 2026-01-02T09:30:00+09:00");
    expect(caption).toContain("Sources: Example Org (full list on card 8)");
    expect(caption).toContain("Not investment advice.");
    expect(caption).toContain("• Why headline");
    expect(warnings).toEqual(["고지 문구는 초안(결정 D8 미확정) — 확정 문구로 교체해야 게시할 수 있다"]);
  });

  it("확정된 고지 문구를 주면 그대로 쓰고 초안 경고를 내지 않는다", () => {
    const { caption, warnings } = buildPublishText(body(preIssueInput({ as_of: "2026-01-02" })), { ...options, disclosure: "Confirmed disclosure line." });
    expect(caption).toContain("Confirmed disclosure line.");
    expect(caption).not.toContain("Not investment advice.");
    expect(warnings).toEqual([]);
  });

  it("기준 시점이 없으면 자리표시를 쓰고(경고는 contentBlockers 가 낸다), 인용 수치가 없으면 그렇게 밝힌다", () => {
    const { caption } = buildPublishText(body(preIssueInput()), options);
    expect(caption).toContain("As of [not set]");
    expect(caption).toContain("No figures are cited in this post");
  });

  it("한국어 편은 한국어 문구, 지원하지 않는 언어는 영어 문구와 경고", () => {
    const ko = buildPublishText(body(preIssueInput({ language: "ko" })), options);
    expect(ko.caption).toContain("기준 시점 [미입력]");
    expect(ko.caption).toContain("투자 권유가 아닙니다");
    const fr = buildPublishText(body(preIssueInput({ language: "fr" })), options);
    expect(fr.warnings.some((w) => w.includes("fr"))).toBe(true);
  });

  it("같은 입력이면 같은 글이다 (결정적)", () => {
    const input = researchInput({ as_of: "2026-01-02" });
    expect(buildPublishText(body(input), options)).toEqual(buildPublishText(body(input), options));
  });

  it("세 종 모두 요약 줄을 정본의 headline 에서 가져온다", () => {
    expect(buildPublishText(body(postIssueInput()), options).caption).toContain("• Result headline\n• Reaction headline\n• Judgment headline\n• Next headline");
    expect(buildPublishText(body(researchInput()), options).caption).toContain("• Tool headline");
  });

  it("캡션이 한도를 넘으면 요약 줄부터 덜어 내고 경고한다", () => {
    const longHook = "가".repeat(1950);
    const { caption, warnings } = buildPublishText(body(preIssueInput({ cover: { title: "A title", hook: longHook } })), options);
    expect([...caption].length).toBeLessThanOrEqual(CAPTION_MAX_CHARS);
    // 한도에 닿을 때까지 뒤 줄부터 덜어 낸다 — 앞 줄은 남는다
    expect(caption).toContain("• Why headline");
    expect(caption).not.toContain("• Check headline");
    expect(warnings.some((w) => w.includes("덜어 냈다"))).toBe(true);
  });
});

describe("해시태그", () => {
  it("사건·종류·형식 태그를 중복 없이 상한 안에서 만든다", () => {
    const tags = buildHashtags(body(preIssueInput({ event: { name: "US midterm elections", kind: "election", scheduled_at: null, timezone: null } })), "en");
    expect(tags).toEqual(["#USMidtermElections", "#Elections", "#EventPreview", "#MarketScenarios", "#Markets", "#Investing"]);
    expect(tags.length).toBeLessThanOrEqual(HASHTAG_MAX);
  });

  it("연구 편은 스레드 주제(도구 편은 도구 이름)와 단계 태그를 쓴다", () => {
    expect(buildHashtags(body(researchInput()), "en").slice(0, 2)).toEqual(["#Worksheet", "#TradingTools"]);
    expect(buildHashtags(body(researchInput({ stage: "idea", stages: { idea: { headline: "h", hypothesis: "x", falsifier: "y" } } })), "en").slice(0, 2)).toEqual(["#ATopic", "#TradingIdeas"]);
  });

  it("출처 발행처는 publisher, 없으면 URL 호스트 (해석·시나리오는 제외)", () => {
    const claims = [sourcedFact, { text: "legacy", source_url: "https://www.example.com/x", accessed_at: "2026-01-01", quote: "q" }, { id: "i", kind: "interpretation", text: "v" }];
    expect(publishersOf(body(preIssueInput({ claims })))).toEqual(["Example Org", "example.com"]);
  });
});

describe("publishTextFindings", () => {
  it("해시태그 30개 초과·캡션 2,200자 초과·태그 모양·금지 표현을 block 으로 잡는다", () => {
    const tags = Array.from({ length: 31 }, (_, i) => `#t${i}`);
    const findings = publishTextFindings({ caption: "무료 " + "a".repeat(CAPTION_MAX_CHARS), hashtags: [...tags, "#bad tag"], warnings: [] }, rules);
    const text = findings.map((f) => `${f.path} ${f.message}`).join("\n");
    expect(text).toContain("해시태그 상한 30개");
    expect(text).toContain("캡션 상한 2200자");
    expect(text).toContain("해시태그 모양이 아니다: #bad tag");
    expect(findings.some((f) => f.code === "banned_expression" && f.severity === "block")).toBe(true);
  });

  it("정상 캡션은 아무것도 걸리지 않는다", () => {
    const text = buildPublishText(body(preIssueInput({ as_of: "2026-01-02" })), { cardCount: 8, disclosure: "Disclosure." });
    expect(publishTextFindings(text, rules)).toEqual([]);
  });
});
