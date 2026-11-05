import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseRenderArgs, runRender } from "./render";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const fixtures = fileURLToPath(new URL("./__fixtures__/", import.meta.url));
const tmp = () => mkdtempSync(join(tmpdir(), "render-"));
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const pngSize = (bytes: Uint8Array) => ({ width: new DataView(bytes.buffer, bytes.byteOffset).getUint32(16), height: new DataView(bytes.buffer, bytes.byteOffset).getUint32(20) });

interface Golden {
  cards: Record<string, string>;
  caption: string;
  hashtags: string[];
}
const golden = JSON.parse(readFileSync(join(fixtures, "render-golden.json"), "utf8")) as Record<string, Golden>;
const HOW_TO_UPDATE = "카드를 일부러 바꿨다면 눈으로 확인한 뒤: bash scripts/render-examples.sh <폴더> → node scripts/render-golden.mjs <폴더>";

// 예시 정본 → 카드 세트. representative: 테스트 픽스처로 커밋한 대표 PNG(바이트까지 같아야 한다)
const EXAMPLES = [
  { name: "pre-issue", file: "content/examples/pre-issue/us-midterms-three-repricings.yaml", backgrounds: "docs/design/card-reference/v2/bg", cards: 8, representative: "02-why_it_matters.png" },
  { name: "post-issue", file: "content/examples/post-issue/us-midterms-what-changed.yaml", backgrounds: null, cards: 8, representative: "03-result_vs_expectation-2.png" },
  { name: "research", file: "content/examples/research/baseline-worksheet.yaml", backgrounds: null, cards: 4, representative: "03-tool-2.png" },
  { name: "research-ko", file: "content/examples/research/baseline-worksheet.ko.yaml", backgrounds: null, cards: 4, representative: null },
] as const;

describe("render — 예시 3종(+한국어) 결정적 스냅샷", () => {
  for (const example of EXAMPLES) {
    it(`${example.name}: ${example.cards}장 1080×1350, 같은 입력 → 같은 PNG sha256, 기준값과 일치`, async () => {
      const out = tmp();
      const args = [example.file, "--out", out, ...(example.backgrounds === null ? [] : ["--backgrounds", example.backgrounds])];
      const first = await runRender(root, args, root);
      expect(first.code, first.lines.join("\n")).toBe(0);

      const cards = readdirSync(out).filter((n) => n.endsWith(".png")).sort();
      expect(cards).toHaveLength(example.cards);
      const shas: Record<string, string> = {};
      for (const name of cards) {
        const bytes = readFileSync(join(out, name));
        expect(pngSize(bytes), name).toEqual({ width: 1080, height: 1350 });
        shas[name] = sha256(bytes);
      }

      // 같은 입력을 다시 그리면 같은 바이트(다른 폴더에서도)
      const again = tmp();
      await runRender(root, [example.file, "--out", again, ...(example.backgrounds === null ? [] : ["--backgrounds", example.backgrounds])], root);
      for (const name of cards) expect(sha256(readFileSync(join(again, name))), `재현 ${name}`).toBe(shas[name]);

      // 기준값(커밋된 스냅샷)과 같다
      const expected = golden[example.name];
      expect(shas, HOW_TO_UPDATE).toEqual(expected?.cards);
      expect(readFileSync(join(out, "caption.txt"), "utf8").trimEnd(), HOW_TO_UPDATE).toBe(expected?.caption);
      expect((JSON.parse(readFileSync(join(out, "render.json"), "utf8")) as { hashtags: string[] }).hashtags).toEqual(expected?.hashtags);

      // 대표 PNG 는 바이트까지 같다(눈으로 보려면 이 파일을 연다)
      if (example.representative !== null) {
        expect(sha256(readFileSync(join(out, example.representative))), HOW_TO_UPDATE).toBe(sha256(readFileSync(join(fixtures, `${example.name}.png`))));
      }
    }, 120_000);
  }

  it("카드 옆에 캡션·대체텍스트·결과 요약을 남기고, 캡션에는 기준 시점·출처 안내·고지가 있다", async () => {
    const out = tmp();
    expect((await runRender(root, [EXAMPLES[2].file, "--out", out], root)).code).toBe(0);
    const caption = readFileSync(join(out, "caption.txt"), "utf8");
    expect(caption).toMatch(/As of /);
    expect(caption).toMatch(/Sources: /);
    expect(caption).toMatch(/Not investment advice\./);
    expect(readFileSync(join(out, "alt-texts.txt"), "utf8").split("\n").filter(Boolean)).toHaveLength(4);
    const meta = JSON.parse(readFileSync(join(out, "render.json"), "utf8")) as { cards: { name: string; sha256: string }[]; warnings: string[] };
    expect(meta.cards).toHaveLength(4);
    expect(meta.warnings.join("\n")).toContain("draft");
  }, 60_000);
});

describe("render — 거부와 사용법", () => {
  it("금지 표현(block)이 있으면 카드를 쓰지 않고 실패한다", async () => {
    const dir = tmp();
    const file = join(dir, "bad.yaml");
    writeFileSync(file, readFileSync(join(root, EXAMPLES[2].file), "utf8").replace("A small tool, with its limits stated first.", "무료 도구, 한계부터."));
    const out = join(dir, "out");
    const { code, lines } = await runRender(root, [file, "--out", out], root);
    expect(code).toBe(1);
    expect(lines.join("\n")).toContain("렌더 거부");
    expect(lines.join("\n")).toContain("[banned_expression] cover.hook");
    expect(existsSync(out)).toBe(false);
  });

  it("스키마 오류는 경로와 함께 실패한다", async () => {
    const dir = tmp();
    const file = join(dir, "bad.yaml");
    writeFileSync(file, "schema: research-5/v1\nid: x\n");
    const { code, lines } = await runRender(root, [file, "--out", join(dir, "out")], root);
    expect(code).toBe(1);
    expect(lines.some((l) => l.includes("status") || l.includes("stage"))).toBe(true);
  });

  it("인자가 틀리면 사용법과 함께 종료 코드 2", async () => {
    for (const args of [[], ["a.yaml"], ["--out", "x"], ["a.yaml", "--out"], ["a.yaml", "--out", "x", "--nope"], ["a.yaml", "b.yaml", "--out", "x"]]) {
      const { code, lines } = await runRender(root, args, root);
      expect(code, args.join(" ")).toBe(2);
      expect(lines.join("\n")).toContain("사용법: render");
    }
  });
});

describe("parseRenderArgs", () => {
  it("파일·--out·--backgrounds 를 읽는다", () => {
    expect(parseRenderArgs(["c.yaml", "--out", "o", "--backgrounds", "b"])).toEqual({ file: "c.yaml", out: "o", backgrounds: "b" });
    expect(parseRenderArgs(["--out", "o", "c.yaml"])).toEqual({ file: "c.yaml", out: "o", backgrounds: null });
  });
});
