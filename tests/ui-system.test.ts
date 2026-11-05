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

// 2026-11-05 사용자 피드백 — 정렬·여백 통일, 캡슐 라벨 없음, 라운드 축소, 과한 설명 없음
const rule = (sel: string) => {
  const m = new RegExp(`(^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`).exec(css);
  if (!m) throw new Error(`규칙 없음: ${sel}`);
  return m[2]!;
};
const prop = (sel: string, p: string) => new RegExp(`(^|;)\\s*${p}\\s*:\\s*([^;]+)`).exec(rule(sel))?.[2]?.trim();

describe("정렬·여백·모양 규격", () => {
  it("모서리는 토큰(--r-*)·0·inherit 만", () => {
    const bad = declarations.filter((d) => d.prop === "border-radius" && !/^(0|inherit|var\(--(r|chip|button|input|kbd)-[a-z]+\))$/.test(d.value));
    expect(bad).toEqual([]);
  });

  it("라벨(배지·단계·개수)은 캡슐이 아니다 — 바탕·둥근 모서리 없음", () => {
    for (const sel of [".ui-badge", ".ui-step", ".ui-nav-count"]) {
      expect(rule(sel)).not.toMatch(/background\s*:/);
      expect(rule(sel)).not.toMatch(/border-radius/);
    }
  });

  it("행 모양 목록(표·목록·체크)은 같은 가로 안쪽 여백을 쓴다", () => {
    const inset = (sel: string) => prop(sel, "padding")?.split(/\s+/)[1];
    expect(new Set([".ui-tr", ".ui-li", ".ui-checkbox"].map(inset))).toEqual(new Set(["var(--sp-4)"]));
  });

  it("사이드바 브랜드·메뉴·바닥은 같은 안쪽 선에 선다", () => {
    const inset = (sel: string) => prop(sel, "padding")?.split(/\s+/).at(-1);
    expect(new Set([".ui-brand", ".ui-nav-item", ".ui-side-foot"].map(inset))).toEqual(new Set(["var(--sp-3)"]));
  });

  it("화면 세로 리듬은 그리드 거터와 같다(페이지 칸 사이 = 본문·레일 사이)", () => {
    expect(prop(".ui-page", "gap")).toBe("var(--sp-6)");
    expect(prop(".ui-split", "gap")).toBe("var(--grid-gutter)");
  });

  it("전환 중에도 다른 탭을 누를 수 있다(전환 겹침이 클릭을 막지 않는다)", () => {
    expect(rule("::view-transition")).toMatch(/pointer-events:\s*none/);
  });
});

describe("화면 글은 짧다", () => {
  // 화면에 그대로 찍히는 한글 문장(JSX 글자·따옴표 문자열)이 40자를 넘지 않는다 — 설명 대신 제목·숫자·행동
  it.each(appFiles.filter((f) => f.endsWith(".tsx")).map((f) => [f.slice(root.length)]))("%s", (rel) => {
    const src = readFileSync(join(root, rel), "utf8").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const texts = [...src.matchAll(/>([^<>{}]*[가-힣][^<>{}]*)</g), ...src.matchAll(/"([^"\n]*[가-힣][^"\n]*)"/g)].map((m) => m[1]!.trim());
    expect(texts.filter((t) => [...t].length > 40)).toEqual([]);
  });
});
