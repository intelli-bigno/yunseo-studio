// 디자인 규격 강제 — 화면은 @yunseo/ui 컴포넌트만, ui 스타일은 토큰 값만 쓴다.
// (화면 코드의 className·style·px 는 eslint.config.mjs 도 막는다 — 여기서는 CSS 와 파일 구성까지 본다.)
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { breakpoint, cssVariables } from "../packages/design-tokens/src/index";

const root = fileURLToPath(new URL("..", import.meta.url));
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));

const appFiles = walk(join(root, "apps/dashboard/src"));
const css = readFileSync(join(root, "packages/ui/src/styles.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const declarations = [...css.matchAll(/([a-z-]+)\s*:\s*([^;{}]+);/g)].map((m) => ({ prop: m[1]!, value: m[2]!.trim() }));

describe("화면은 공통 컴포넌트만 쓴다", () => {
  it("대시보드에 자체 CSS 파일이 없다", () => {
    expect(appFiles.filter((f) => f.endsWith(".css"))).toEqual([]);
  });

  it.each(appFiles.filter((f) => f.endsWith(".tsx")).map((f) => [f.slice(root.length)]))("%s 에 className·style·px 가 없다", (rel) => {
    const src = readFileSync(join(root, rel), "utf8");
    expect(src).not.toMatch(/\bclassName=/);
    expect(src).not.toMatch(/\bstyle=\{/);
    expect(src).not.toMatch(/\d+px\b/);
  });
});

describe("ui 스타일은 토큰 값만 쓴다", () => {
  it("글자 크기는 6단계 변수(--fs-*)만", () => {
    const bad = declarations.filter((d) => d.prop === "font-size" && !/^var\(--fs-(label|body|title|heading|metric|hero)\)$/.test(d.value));
    expect(bad).toEqual([]);
  });

  it("여백·패딩·간격은 간격 변수(--sp-*·컴포넌트 치수)와 0 만", () => {
    const spacing = /^(margin|padding|gap|row-gap|column-gap)(-(top|right|bottom|left))?$/;
    const token = /^(0|auto|-1px|var\(--(sp|grid|button|input|chip|kbd)-[a-z0-9-]+\)|calc\(.*\))$/;
    const bad = declarations.filter((d) => spacing.test(d.prop) && !d.value.split(/\s+(?![^(]*\))/).every((v) => token.test(v)));
    expect(bad).toEqual([]);
  });

  it("px 숫자는 선 두께(1·2px)와 반응형 경계뿐이다", () => {
    const allowed = new Set(["1px", "2px", "-1px", `${breakpoint.rail}px`, `${breakpoint.sidebar}px`]);
    const px = [...css.matchAll(/-?\d+(\.\d+)?px/g)].map((m) => m[0]).filter((v) => !allowed.has(v));
    expect(px).toEqual([]);
  });

  it("쓰는 변수는 모두 토큰에 있다", () => {
    const defined = new Set(Object.keys(cssVariables()));
    const local = new Set(["--cols", "--n", "--y", "--font-sans", "--font-mono", "--rx", "--ry", "--rs"]); // --r*: 누름 물결 위치·크기(motion.ts 가 넣는다)
    const used = new Set([...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]!));
    expect([...used].filter((v) => !defined.has(v) && !local.has(v))).toEqual([]);
  });
});
