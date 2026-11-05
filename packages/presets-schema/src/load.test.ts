import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { POST_STAGE_KEYS, RESEARCH_STAGES, STAGE_KEYS, findBannedExpressions } from "@yunseo/domain";
import { PresetError, brandPromoTexts, findPlaceholders, loadPresets } from "./index";

const presetsDir = fileURLToPath(new URL("../../../presets", import.meta.url));

describe("loadPresets (저장소의 실제 프리셋)", () => {
  const bundle = loadPresets(presetsDir);

  it("active.yaml 조합을 읽어 스키마 검증을 통과한다", () => {
    expect(bundle.formats.map((f) => f.id)).toEqual(["pre-issue-5", "post-issue-4", "research-5"]);
    expect(bundle.versionHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("발행 언어는 영어 기본값이지만 확정 전(provisional)으로 표시된다", () => {
    expect(bundle.language).toMatchObject({ publish: "en", status: "provisional" });
  });

  it("브랜드명·핸들·서체·강조색이 미정이라 게시 차단 대상으로 잡힌다", () => {
    const placeholders = findPlaceholders(bundle);
    expect(placeholders).toEqual(
      expect.arrayContaining(["$.brand.name", "$.brand.handle", "$.brand.typeface.display", "$.brand.palette.accent"]),
    );
  });

  it("컨셉·핵심 문장은 브리프 원문 그대로다", () => {
    expect(bundle.brand.core_sentence).toBe("세계의 변화에서, 시장의 다음 질문을 찾습니다.");
    expect(bundle.brand.concept).toBe("세계의 변화와 시장을 연결하고, 다가올 사건의 파급효과를 미리 짚는 투자 매거진");
  });

  it("이슈 이전 포맷의 5단은 도메인 정본(STAGE_KEYS)과 같고 카드는 표지+5단+출처 7장이다", () => {
    const format = bundle.formats.find((f) => f.id === "pre-issue-5");
    expect(format?.stages.map((s) => s.id)).toEqual([...STAGE_KEYS]);
    expect(format?.cards.map((c) => c.slot)).toEqual(["cover", ...STAGE_KEYS, "sources"]);
  });

  it("이슈 이후 포맷의 4단은 도메인 정본(POST_STAGE_KEYS)과 같고 카드는 표지+4단+출처다", () => {
    const format = bundle.formats.find((f) => f.id === "post-issue-4");
    expect(format).toMatchObject({ kind: "post_issue", status: "active" });
    expect(format?.stages.map((s) => s.id)).toEqual([...POST_STAGE_KEYS]);
    expect(format?.cards.map((c) => c.slot)).toEqual(["cover", ...POST_STAGE_KEYS, "sources"]);
  });

  it("연구 포맷의 5단계는 도메인 정본(RESEARCH_STAGES)과 같고 슬롯은 표지+단계별+출처다", () => {
    const format = bundle.formats.find((f) => f.id === "research-5");
    expect(format).toMatchObject({ kind: "research", status: "active" });
    expect(format?.stages.map((s) => s.id)).toEqual([...RESEARCH_STAGES]);
    expect(format?.cards.map((c) => c.slot)).toEqual(["cover", ...RESEARCH_STAGES, "sources"]);
  });

  it("카드 장면(pages)마다 영어·한국어 질문이 있고, 시나리오·도구는 두 장이다", () => {
    for (const format of bundle.formats) {
      for (const card of format.cards.filter((c) => c.slot !== "cover")) {
        expect(card.pages?.length, `${format.id}/${card.slot}`).toBeGreaterThan(0);
        for (const page of card.pages ?? []) expect(Object.keys(page.q).sort(), `${format.id}/${card.slot}`).toEqual(["en", "ko"]);
      }
    }
    expect(bundle.formats[0]?.cards.find((c) => c.slot === "scenarios")?.pages).toHaveLength(2);
    expect(bundle.formats[2]?.cards.find((c) => c.slot === "tool")?.pages).toHaveLength(2);
  });

  it("금지 표현: 브리프의 4개는 block, 「지표」는 브랜드 전면 문구에서만", () => {
    const byId = new Map(bundle.bannedExpressions.map((r) => [r.id, r]));
    for (const id of ["ko-free", "ko-profit-guarantee", "ko-secret-info", "ko-unconditional"]) {
      expect(byId.get(id)).toMatchObject({ severity: "block", origin: "brief", surfaces: ["body", "brand_promo"] });
    }
    expect(byId.get("ko-indicator-brand-front")).toMatchObject({ severity: "block", surfaces: ["brand_promo"] });
  });

  it("제안(proposed) 규칙은 모두 warn 이다", () => {
    const proposed = bundle.bannedExpressions.filter((r) => r.origin === "proposed");
    expect(proposed.length).toBeGreaterThan(0);
    expect(proposed.every((r) => r.severity === "warn")).toBe(true);
  });

  it("실제 규칙 파일로 브리프의 금지 표현이 모두 잡힌다", () => {
    for (const text of ["무료 공개", "수익 보장", "비밀 정보", "무조건 오른다"]) {
      const hits = findBannedExpressions(text, "body", bundle.bannedExpressions);
      expect(hits.some((h) => h.severity === "block"), text).toBe(true);
    }
    expect(findBannedExpressions("확인할 지표", "body", bundle.bannedExpressions)).toEqual([]);
    expect(findBannedExpressions("핵심 지표 제공", "brand_promo", bundle.bannedExpressions)).toHaveLength(1);
  });

  it("브랜드 전면 홍보 문구(컨셉·핵심 문장)에는 금지 표현이 없다", () => {
    for (const { path, text } of brandPromoTexts(bundle.brand)) {
      expect(findBannedExpressions(text, "brand_promo", bundle.bannedExpressions), path).toEqual([]);
    }
  });
});

describe("loadPresets (오류 처리)", () => {
  function fixture(files: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), "presets-"));
    for (const [name, text] of Object.entries(files)) {
      mkdirSync(join(dir, name, ".."), { recursive: true });
      writeFileSync(join(dir, name), text);
    }
    return dir;
  }

  it("active.yaml 이 presets 밖을 가리키면 거부한다", () => {
    const dir = fixture({
      "active.yaml":
        "brand: ../x.yaml\ncharacter: c.yaml\ntone: t.yaml\nlanguage: l.yaml\ncompliance: b.yaml\nformats: [f.yaml]\n",
    });
    expect(() => loadPresets(dir)).toThrow(PresetError);
    expect(() => loadPresets(dir)).toThrow("presets 디렉터리 밖");
  });

  it("스키마 위반은 파일 이름과 경로를 붙여 모아서 던진다", () => {
    const real = (name: string) => readFileSync(join(presetsDir, name), "utf8");
    const dir = fixture({
      "active.yaml": real("active.yaml"),
      "brand/brand.default.yaml": real("brand/brand.default.yaml").replace("#FFFFFF", "white"),
      "character/character.default.yaml": real("character/character.default.yaml"),
      "tone/tone.default.yaml": real("tone/tone.default.yaml"),
      "language/language.default.yaml": real("language/language.default.yaml"),
      "compliance/banned-expressions.yaml": real("compliance/banned-expressions.yaml"),
      "format/pre-issue-5.yaml": real("format/pre-issue-5.yaml"),
      "format/post-issue-4.yaml": real("format/post-issue-4.yaml"),
      "format/research-5.yaml": real("format/research-5.yaml"),
    });
    try {
      loadPresets(dir);
      throw new Error("던져지지 않음");
    } catch (error) {
      expect(error).toBeInstanceOf(PresetError);
      expect((error as PresetError).errors).toEqual([expect.stringContaining("brand/brand.default.yaml: palette.bg")]);
    }
  });
});
