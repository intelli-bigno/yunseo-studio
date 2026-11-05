import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ContentDocument } from "@yunseo/application";
import { contentKindOf, validateContentDoc, type ContentRules } from "@yunseo/domain";
import { postIssueInput, preIssueInput, researchInput, sourcedFact } from "@yunseo/domain/testing";
import { ContentBlockedError, InvalidContentError, createHtmlCardRenderer, type HtmlCardRendererOptions } from "./card-renderer";
import { createRasterizer, pngSize, type Rasterizer } from "./raster";

const q = (en: string, ko: string = en) => ({ q: { en, ko } });
const card = (slot: string, pages: number, max_chars: number | null = 400) => ({ slot, stage: slot === "cover" || slot === "sources" ? null : slot, max_chars, pages: Array.from({ length: pages }, (_, i) => q(`Q ${slot} ${i + 1}`, `질문 ${slot} ${i + 1}`)) });
const rules: ContentRules = {
  banned: [{ id: "free", terms: ["무료"], surfaces: ["body"], severity: "block", origin: "brief", reason: "t" }],
  formats: [
    { id: "pre-issue-5", limits_provisional: true, cards: [{ slot: "cover", stage: null, max_chars: 90 }, card("why_it_matters", 1), card("market_expectation", 1), card("scenarios", 2), card("transmission", 1), card("after_checks", 1), card("sources", 1, null)] },
    { id: "post-issue-4", limits_provisional: true, cards: [card("result_vs_expectation", 3), card("market_reaction", 1), card("judgment_update", 1), card("next_variables", 1), card("sources", 1, null)] },
    { id: "research-5", limits_provisional: true, cards: [card("tool", 2), card("sources", 1, null)] },
  ],
};

function doc(input: Record<string, unknown>): ContentDocument {
  const parsed = validateContentDoc(input);
  if (!parsed.ok) throw new Error(parsed.errors.join("\n"));
  return { id: parsed.value.id, kind: contentKindOf(parsed.value), schema: parsed.value.schema, body: input };
}

/** 머리글(IHDR)만 맞는 가짜 PNG — 래스터를 건너뛰는 시험용 */
function fakePng(width = 1080, height = 1350): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}
const stub: Rasterizer = { png: async () => fakePng() };
const tmp = () => mkdtempSync(join(tmpdir(), "cards-"));
const make = (over: Partial<HtmlCardRendererOptions> = {}) => createHtmlCardRenderer({ rules, rasterizer: stub, ...over });

describe("createHtmlCardRenderer — 결과 모양", () => {
  it("이전 편은 8장이고 파일명·크기·sha256 이 맞으며 캡션·해시태그·대체텍스트가 카드 수와 맞는다", async () => {
    const out = tmp();
    const result = await make().render(doc(preIssueInput()), out);
    expect(result.pieceId).toBe("pre-sample");
    expect(result.cards.map((c) => c.name)).toEqual([
      "01-cover.png", "02-why_it_matters.png", "03-market_expectation.png", "04-scenarios.png", "05-scenarios-2.png", "06-transmission.png", "07-after_checks.png", "08-sources.png",
    ]);
    for (const c of result.cards) {
      const bytes = readFileSync(c.path);
      expect(c.path).toBe(join(out, c.name));
      expect(c.bytes).toBe(bytes.byteLength);
      expect(c.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    }
    expect(result.altTexts).toHaveLength(8);
    expect(result.altTexts[0]).toBe("Card 1 of 8. A title.");
    expect(result.caption).toContain("A title");
    expect(result.hashtags.length).toBeGreaterThan(0);
  });

  it("draft·채널 이름 TBD·고지 문구 초안·비어 있는 칸을 경고로 남긴다", async () => {
    const { warnings } = await make().render(doc(preIssueInput()), tmp());
    const text = warnings.join("\n");
    expect(text).toContain("채널 이름이 정해지지 않았다(TBD)");
    expect(text).toContain("draft 이므로 카드에 초안 표시를 그렸다");
    expect(text).toContain("고지 문구는 초안(결정 D8 미확정)");
    expect(text).toContain("[draft] 운영자 고유 해석이 비어 있다");
  });

  it("채널 이름·고지 문구를 정하면 해당 경고가 사라진다", async () => {
    const { warnings } = await make({ brand: { name: "Sample Channel", operator: "Sample Operator" }, disclosure: "Confirmed disclosure." }).render(doc(preIssueInput()), tmp());
    expect(warnings.join("\n")).not.toContain("채널 이름");
    expect(warnings.join("\n")).not.toContain("고지 문구");
  });

  it("이후 편·연구 편도 같은 길로 그린다 (장 수는 계획대로)", async () => {
    expect((await make().render(doc(postIssueInput()), tmp())).cards).toHaveLength(8);
    expect((await make().render(doc(researchInput()), tmp())).cards.map((c) => c.name)).toEqual(["01-cover.png", "02-tool.png", "03-tool-2.png", "04-sources.png"]);
  });

  it("한국어 편은 한국어 문구·질문을 쓴다", async () => {
    const result = await make().render(doc(preIssueInput({ language: "ko" })), tmp());
    expect(result.altTexts[1]).toContain("카드 2/8.");
    expect(result.altTexts[1]).toContain("질문 why_it_matters 1");
    expect(result.caption).toContain("기준 시점 [미입력]");
  });

  it("프리셋에 질문이 없는 장은 경고하고, 지원하지 않는 언어는 영어로 돌아가며 알린다", async () => {
    const result = await make({ rules: { ...rules, formats: [] } }).render(doc(preIssueInput({ language: "fr" })), tmp());
    expect(result.warnings.join("\n")).toContain("포맷 프리셋에 why_it_matters 1번째 장의 질문(en)이 없다");
    expect(result.warnings.join("\n")).toContain("fr 를 지원하지 않아 영어 문구를 썼다");
  });
});

describe("createHtmlCardRenderer — 렌더 전 검사", () => {
  it("block 이 있으면 파일을 하나도 쓰지 않고 거부한다", async () => {
    const out = join(tmp(), "not-created");
    const input = preIssueInput() as { cover: { hook: string } };
    input.cover.hook = "무료 공개";
    const attempt = make().render(doc(input), out);
    await expect(attempt).rejects.toBeInstanceOf(ContentBlockedError);
    // 같은 문장이 본문(cover.hook)과 캡션에 다 나오므로 두 곳에서 잡힌다
    await expect(attempt).rejects.toMatchObject({ findings: [expect.objectContaining({ code: "banned_expression", path: "cover.hook" }), expect.objectContaining({ code: "banned_expression", path: "caption" })] });
    expect(existsSync(out)).toBe(false);
  });

  it("verified 편이 출처·기준 시점·운영자 해석을 갖추지 못하면 거부한다", async () => {
    const attempt = make().render(doc(preIssueInput({ status: "verified", claims: [{ text: "Fact 7" }] })), tmp());
    await expect(attempt).rejects.toBeInstanceOf(ContentBlockedError);
    const { findings } = (await attempt.catch((e: unknown) => e)) as ContentBlockedError;
    expect(findings.map((f) => f.code)).toEqual(expect.arrayContaining(["source_missing", "as_of_missing", "verification"]));
  });

  it("출처를 갖춘 verified 편은 카드에 초안 표시 없이 그린다", async () => {
    const input = preIssueInput({
      status: "verified",
      as_of: "2026-01-02T00:00:00Z",
      importance: "major",
      operator_view: "My view.",
      event: { name: "e", kind: "data_release", scheduled_at: "2026-01-03T00:00:00Z", timezone: "UTC" },
      claims: [sourcedFact],
    });
    const result = await make({ brand: { name: "Sample Channel" } }).render(doc(input), tmp());
    expect(result.warnings.join("\n")).not.toContain("draft");
    expect(result.caption).toContain("Sources: Example Org");
  });

  it("글자 수가 상한의 1.5배를 넘으면 가정값 상한이어도 거부한다", async () => {
    const input = preIssueInput() as { stages: { why_it_matters: { points: string[] } } };
    input.stages.why_it_matters.points = ["x".repeat(700)];
    await expect(make().render(doc(input), tmp())).rejects.toMatchObject({ findings: [expect.objectContaining({ code: "char_limit", path: "stages.why_it_matters" })] });
  });

  it("스키마 오류·문서와 본문의 불일치·캡션 한도 초과는 거부한다", async () => {
    await expect(make().render({ id: "x", kind: "pre-issue", schema: "pre-issue-5/v1", body: { schema: "pre-issue-5/v1" } }, tmp())).rejects.toBeInstanceOf(InvalidContentError);
    await expect(make().render({ ...doc(preIssueInput()), kind: "research" }, tmp())).rejects.toBeInstanceOf(InvalidContentError);
    await expect(make().render({ ...doc(preIssueInput()), id: "other" }, tmp())).rejects.toBeInstanceOf(InvalidContentError);
    const input = preIssueInput() as { cover: { hook: string } };
    input.cover.hook = "가".repeat(2300);
    await expect(make({ rules: { ...rules, formats: [] } }).render(doc(input), tmp())).rejects.toMatchObject({ findings: [expect.objectContaining({ code: "caption_limit", path: "caption" })] });
  });

  it("래스터가 규격 밖 크기를 내면 실패한다", async () => {
    const wrong: Rasterizer = { png: async () => fakePng(1080, 1080) };
    await expect(make({ rasterizer: wrong }).render(doc(preIssueInput()), tmp())).rejects.toThrow("크기 오류: 1080x1080");
  });
});

describe("createHtmlCardRenderer — 실제 래스터 (satori + resvg)", () => {
  // 1×1 PNG — 배경 슬롯 시험용
  const ONE_PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  const real = { rasterizer: createRasterizer() };

  it("같은 입력이면 폴더가 달라도 카드 바이트가 같다(결정적)이고 모두 1080×1350 PNG 다", async () => {
    const renderer = createHtmlCardRenderer({ rules, ...real });
    const a = await renderer.render(doc(researchInput()), tmp());
    const b = await renderer.render(doc(researchInput()), tmp());
    expect(a.cards.map((c) => c.sha256)).toEqual(b.cards.map((c) => c.sha256));
    for (const c of a.cards) expect(pngSize(readFileSync(c.path))).toEqual({ width: 1080, height: 1350 });
    expect(new Set(a.cards.map((c) => c.sha256)).size).toBe(a.cards.length);
  }, 60_000);

  it("입력이 달라지면 카드가 달라지고, 배경 슬롯을 주면 그 카드만 바뀐다", async () => {
    const dir = tmp();
    const file = join(dir, "bg.png");
    writeFileSync(file, ONE_PX);
    const plain = await createHtmlCardRenderer({ rules, ...real }).render(doc(researchInput()), tmp());
    const withBg = await createHtmlCardRenderer({ rules, ...real, backgrounds: { tool: file } }).render(doc(researchInput()), tmp());
    expect(withBg.cards.map((c, i) => c.sha256 === plain.cards[i]?.sha256)).toEqual([true, false, true, true]);
    const renamed = await createHtmlCardRenderer({ rules, ...real, brand: { name: "Sample Channel" } }).render(doc(researchInput()), tmp());
    expect(renamed.cards[0]?.sha256).not.toBe(plain.cards[0]?.sha256);
  }, 60_000);

  it("배경 파일이 없으면 실패하고, jpg·png 가 아니면 토큰 색 배경으로 그리며 알린다", async () => {
    const dir = tmp();
    const webp = join(dir, "bg.webp");
    writeFileSync(webp, "x");
    await expect(make({ backgrounds: { tool: join(dir, "missing.png") } }).render(doc(researchInput()), tmp())).rejects.toThrow("파일이 없다");
    const result = await make({ backgrounds: { tool: webp } }).render(doc(researchInput()), tmp());
    expect(result.warnings.join("\n")).toContain("jpg·png 만 쓸 수 있다");
  });
});
