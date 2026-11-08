// 인수 문서(CLAUDE.md · docs/handoff · .claude/skills) 점검 — 링크가 깨지지 않았나, 샘플 덱이 지금 스키마로 유효한가, 스크립트·.env.example 이 약속을 지키나.
// 샘플 덱은 서버 없이 도메인의 ops 적용기(applyCardOp)로 검증한다 — 같은 규칙을 대시보드가 쓴다.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { applyCardOp, createDeck, findBannedExpressions, type CardDeck } from "../packages/domain/src/index";
import { loadPresets } from "../packages/presets-schema/src/index";

const root = fileURLToPath(new URL("..", import.meta.url));
const rel = (p: string) => join(root, p);

const skillDirs = readdirSync(rel(".claude/skills"), { withFileTypes: true }).filter((e) => e.isDirectory());
const docs = ["CLAUDE.md", "docs/handoff/README.md", ...skillDirs.map((d) => `.claude/skills/${d.name}/SKILL.md`)];

/** GitHub 방식 제목 → 앵커 (소문자, 문장부호 제거, 공백 → 하이픈) */
const slug = (h: string) => h.trim().toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, "").replace(/\s/g, "-");
const anchorsOf = (file: string) => [...readFileSync(file, "utf8").matchAll(/^#{1,6}\s+(.+)$/gm)].map((m) => slug(m[1]!));

describe("인수 문서 링크", () => {
  it("스킬 4개가 있고 머리말(name·description)이 맞다", () => {
    expect(skillDirs.map((d) => d.name).sort()).toEqual(["add-reference", "edit-reels", "gen-background", "new-cardnews"]);
    for (const d of skillDirs) {
      const text = readFileSync(rel(`.claude/skills/${d.name}/SKILL.md`), "utf8");
      expect(text, d.name).toMatch(new RegExp(`^---\\nname: ${d.name}\\ndescription: .{20,}\\n---\\n`));
    }
  });

  for (const doc of docs) {
    it(`${doc} — 상대 링크와 앵커가 가리키는 곳이 있다`, () => {
      const file = rel(doc);
      const text = readFileSync(file, "utf8").replace(/```[\s\S]*?```/g, "");
      const links = [...text.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]!).filter((l) => !/^(https?:|mailto:)/.test(l));
      expect(links.length, doc).toBeGreaterThan(0);
      for (const link of links) {
        const [path = "", anchor] = link.split("#");
        const target = path ? resolve(dirname(file), path) : file;
        expect(existsSync(target), `${doc} → ${link}`).toBe(true);
        if (anchor && target.endsWith(".md")) expect(anchorsOf(target), `${doc} → ${link}`).toContain(anchor);
      }
    });
  }
});

describe("샘플 덱 (docs/handoff/sample-deck.json)", () => {
  const sample = JSON.parse(readFileSync(rel("docs/handoff/sample-deck.json"), "utf8")) as { title: string; preset: "4:5"; ops: unknown[] };
  const ids = (() => {
    let n = 0;
    return () => `g${++n}`;
  })();
  const deck: CardDeck = applyCardOp(createDeck("sample", sample.title, sample.preset, "c1"), { op: "batch", ops: sample.ops }, ids).deck;

  it("지금 스키마에서 ops 가 한 번에 적용되고 4장이 된다", () => {
    expect(deck.cards).toHaveLength(4);
    expect(deck.cards.every((c) => c.layers.length >= 3)).toBe(true);
  });

  it("이미지 주소는 대시보드가 실제로 내려주는 파일이다 (/api/refs → docs/design)", () => {
    const srcs = deck.cards.flatMap((c) => c.layers).flatMap((l) => (l.kind === "image" ? [l.src] : []));
    expect(srcs.length).toBeGreaterThan(0);
    for (const src of srcs) {
      expect(src).toMatch(/^\/api\/refs\//);
      const parts = src.slice("/api/refs/".length).split("/");
      expect(parts.every((p) => /^[a-z0-9-]+(\.(jpg|png))?$/i.test(p)), src).toBe(true); // library.ts referenceAsset 규칙
      expect(existsSync(rel(join("docs/design", ...parts))), src).toBe(true);
    }
  });

  it("금지 표현이 없고 자리표시·SAMPLE 표시가 있다", () => {
    const { bannedExpressions } = loadPresets(rel("presets"));
    const texts = deck.cards.flatMap((c) => c.layers).flatMap((l) => (l.kind === "text" ? [l.text] : l.kind === "sticker" ? [l.label] : []));
    for (const t of texts) expect(findBannedExpressions(t, "body", bannedExpressions), t).toEqual([]);
    const all = texts.join("\n");
    expect(all).toContain("SAMPLE");
    expect(all).toMatch(/\[[^\]]+입력\]/);
  });
});

describe("스크립트 · .env.example", () => {
  for (const f of ["scripts/setup.sh", "scripts/start.sh"]) {
    it(`${f} 는 bash 문법이 맞다`, () => {
      expect(() => execFileSync("bash", ["-n", rel(f)])).not.toThrow();
    });
  }

  it(".env.example 에 비밀값이 없다 (값은 비었거나 알려진 기본값만)", () => {
    const allowed: Record<string, string[]> = { PORT: ["8930"], STUDIO_CLOCK: ["system"] };
    const lines = readFileSync(rel(".env.example"), "utf8")
      .split("\n")
      .filter((l) => /^[A-Z_]+=/.test(l));
    expect(lines.length).toBeGreaterThan(4);
    for (const line of lines) {
      const [key = "", rest = ""] = line.split("=");
      const value = rest.replace(/\s+#.*$/, "").trim();
      expect(value === "" || allowed[key]?.includes(value), line).toBe(true);
    }
  });
});
