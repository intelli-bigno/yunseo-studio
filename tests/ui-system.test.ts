// 디자인 규격 강제 — 화면은 @yunseo/ui 컴포넌트만, ui 스타일은 토큰 값만 쓴다.
// (화면 코드의 className·style·px 는 eslint.config.mjs 도 막는다 — 여기서는 CSS 와 파일 구성까지 본다.)
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { breakpoint, component, contrastPairs, cssVariables, layout, space } from "../packages/design-tokens/src/index";

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
    const allowed = new Set(["1px", "2px", "-1px", `${breakpoint.rail}px`, `${breakpoint.sidebar}px`, `${breakpoint.phone}px`]);
    const px = [...css.matchAll(/-?\d+(\.\d+)?px/g)].map((m) => m[0]).filter((v) => !allowed.has(v));
    expect(px).toEqual([]);
  });

  it("쓰는 변수는 모두 토큰에 있다", () => {
    const defined = new Set(Object.keys(cssVariables()));
    const local = new Set(["--cols", "--n", "--y", "--font-sans", "--font-mono", "--rx", "--ry", "--rs", "--ar", "--ed-left", "--ed-right", "--ed-right-w", "--ed-thumb", "--ed-scroll", "--ed-fit", "--deck-n"]); // --r*: 누름 물결 위치·크기(motion.ts 가 넣는다), --ar: 캔버스 가로/세로 비(CanvasStage 가 넣는다), --ed-*: 편집기 패널 폭·장 목록 치수, --deck-n: 장 수(DeckStrip 이 넣는다)
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

describe("빈 캔버스·썸네일 구분", () => {
  it("캔버스는 틀 선(--c-edge)으로 앱 바탕과 갈리고, 편집기 가운데 칸·썸네일 틀은 한 단계 밝은 표면이다", () => {
    expect(prop(".ui-canvas", "box-shadow")).toContain("var(--c-edge)");
    expect(prop(".ui-editor-stage", "background")).toBe("var(--c-raised)");
    expect(prop(".ui-mcard-frame", "background")).toBe("var(--c-raised)");
    expect(prop(".ui-mcard-frame", "border")).toContain("var(--c-edge)");
    expect(prop(".ui-deck-thumb", "border")).toContain("var(--c-edge)");
  });

  it("빈 카드 안내 겹침은 클릭을 막지 않는다", () => {
    expect(prop(".ui-canvas-empty", "pointer-events")).toBe("none");
  });
});

describe("아이콘 버튼은 어두운 바탕에서 보인다", () => {
  it("글자는 밝은 글자 토큰, 바탕은 어두운 표면 토큰 — 종이용(--c-paper*) 색을 쓰지 않는다", () => {
    const body = rule(".ui-icon-btn");
    expect(prop(".ui-icon-btn", "color")).toBe("var(--c-text)");
    expect(prop(".ui-icon-btn", "background")).toBe("var(--c-raised)");
    expect(body).not.toContain("--c-paper");
    expect(rule(".ui-icon-btn[disabled]")).not.toContain("--c-paper");
    expect(rule(".ui-icon-btn[disabled]")).not.toMatch(/opacity/); // 흐리게 하지 않고 색 토큰으로 구분
  });

  it("쓰는 글자/바탕 쌍은 모두 토큰 대비 검사에 들어 있다(본문 4.5 이상)", () => {
    const has = (fg: string, bg: string) => contrastPairs.some((p) => p.fg === fg && p.bg === bg && p.min >= 4.5);
    expect(has("text", "raised")).toBe(true); // 기본
    expect(has("text", "surface")).toBe(true); // 패널·덱 줄 바탕
    expect(has("text", "hover")).toBe(true); // 누르려고 올렸을 때
    expect(has("textMute", "surface")).toBe(true); // 꺼진 상태
  });

  it("터치 최소 크기(24) 이상이다 — 버튼 높이에서 간격 한 단계를 뺀 28", () => {
    expect(prop(".ui-icon-btn", "width")).toBe("calc(var(--button-height) - var(--sp-3))");
    expect(component.button.height - space[3]).toBeGreaterThanOrEqual(24);
  });
});

describe("편집 화면은 화면 높이에 맞춘다(스크롤 없이 조작)", () => {
  // 넓은 화면(패널이 쌓이지 않는 폭)에만 적용된다 — 1184px 이하는 문서가 자연스럽게 길어진다
  const block = /@media not all and \(max-width: 1184px\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";

  it("페이지 높이는 헤더 아래 남은 100dvh 이고 안쪽만 스크롤한다", () => {
    expect(block).toMatch(/\.ui-page\.is-fit \{[^}]*height:\s*calc\(100dvh - var\(--l-topbar\)\)/);
    expect(block).toMatch(/\.ui-page\.is-fit \{[^}]*overflow:\s*hidden/);
    expect(block).toMatch(/\.ui-page\.is-fit \.ui-editor \{[^}]*min-height:\s*0/);
    expect(block).toMatch(/\.ui-page\.is-fit \.ui-editor-side \{[^}]*position:\s*static/);
  });

  it("캔버스는 남는 높이에 맞춰 줄고 카드 비율(--ar)을 지킨다", () => {
    expect(block).toMatch(/\.ui-canvas-fit \{[^}]*container-type:\s*size/);
    expect(block).toMatch(/\.ui-canvas-fit \.ui-canvas:not\(\.is-mini\) \{[^}]*width:\s*min\(100cqw, calc\(100cqh \* var\(--ar, 1\)\)\)/);
  });

  it("장 목록(strip)은 줄지 않고 캔버스 칸(stage)이 줄어든다", () => {
    expect(block).toMatch(/\.ui-editor-strip \{[^}]*flex:\s*none/);
    expect(block).toMatch(/\.ui-editor-stage \{[^}]*flex:\s*1 1 0[^}]*min-height:\s*0/);
  });

  it("셸·헤더 높이 변수와 Page fit 이 서로 맞는다", () => {
    expect(cssVariables()["--l-topbar"]).toBe(`${layout.topbar}px`);
  });
});

describe("화면 글은 짧다", () => {
  // 화면에 그대로 찍히는 한글 문장(JSX 글자·따옴표 문자열)이 40자를 넘지 않는다 — 설명 대신 제목·숫자·행동
  it.each(appFiles.filter((f) => f.endsWith(".tsx")).map((f) => [f.slice(root.length)]))("%s", (rel) => {
    const src = readFileSync(join(root, rel), "utf8").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const texts = [...src.matchAll(/>([^<>{}]*[가-힣][^<>{}]*)</g), ...src.matchAll(/"([^"\n]*[가-힣][^"\n]*)"/g)].map((m) => m[1]!.trim());
    expect(texts.filter((t) => !/[=?`()]/.test(t) && [...t].length > 40)).toEqual([]); // 코드 조각(삼항·화살표)은 글이 아니다
  });
});

describe("카드 편집기 오른쪽 패널은 레퍼런스가 주인이다", () => {
  it("기본 폭은 편집기의 40% 이고 비율 변수(--ed-right)로 바뀐다 — 가운데 칸 최소 폭을 지킨다", () => {
    const r = rule(".ui-editor");
    expect(r).toMatch(/--ed-right-w:\s*clamp\([^;]*var\(--ed-right, 40%\)/);
    expect(r).toMatch(/grid-template-columns:\s*var\(--ed-left\) minmax\(0, 1fr\) var\(--ed-right-w\)/);
    expect(r).toMatch(/100% - var\(--ed-left\)/);
  });

  it("레퍼런스 그리드는 열 2~4개 메이슨리이고 그림은 자르지 않는다(원본 비율)", () => {
    expect(prop(".ui-refgrid", "columns")).toMatch(/^calc\(var\(--sp-8\) \* 2\) 4$/);
    expect(prop(".ui-ref", "break-inside")).toBe("avoid");
    expect(prop(".ui-ref-img", "height")).toBe("auto");
    expect(prop(".ui-ref-img", "aspect-ratio")).toBe("auto 4 / 5"); // 로딩 전 자리만 4:5, 받으면 원본 비율 → 지연 로딩이 화면 밖 그림을 받지 않는다
    expect(prop(".ui-ref-img", "object-fit")).toBeUndefined();
  });

  it("속성 시트는 패널 아래 흐름에 붙어(absolute 아님) 레퍼런스 그리드를 가리지 않는다 — 열리면 그리드가 줄고 둘 다 따로 스크롤된다", () => {
    expect(prop(".ui-sheet", "position")).toBeUndefined();
    // 레퍼런스 우선(상수 없이 구조로) — 고정 바는 스크롤 밖 flex 항목, 그리드 본문은 flex: 1 0 50%(패널 50% 아래로 안 줄어듦), 시트만 줄어든다(상한 45%)
    expect(prop(".ui-sheet", "flex")).toBe("0 1 auto");
    expect(prop(".ui-sheet", "min-height")).toBe("var(--button-height)");
    expect(prop(".ui-sheet", "max-height")).toBe("45%");
    expect(prop(".ui-editor-side-body.is-grid", "flex")).toBe("1 0 50%");
    expect(prop(".ui-editor-side-main > .ui-panel-bar", "flex")).toBe("none");
    expect(css).not.toContain("--ed-bar"); // 바 높이를 가정한 매직 넘버를 두지 않는다
    expect(prop(".ui-sheet-body", "overflow-y")).toBe("auto");
    expect(prop(".ui-editor-side-body", "flex")).toBe("1");
    expect(prop(".ui-editor-side-body", "min-height")).toBe("0");
    expect(prop(".ui-editor-side-body", "overflow-y")).toBe("auto");
    expect(css).not.toContain(".ui-editor-side-body.has-sheet"); // 시트 높이를 가늠한 아래 여백으로 비워 두지 않는다
    expect(css).toMatch(/@media \(max-width: 1184px\) \{[\s\S]*?\.ui-sheet \{[^}]*max-height:\s*none/);
  });

  it("폭 조절 경계는 패널 왼쪽 가장자리에 있고 좁은 화면에서는 숨긴다", () => {
    expect(prop(".ui-editor-split", "cursor")).toBe("col-resize");
    expect(prop(".ui-editor-split", "left")).toBe("0");
    expect(css).toMatch(/@media \(max-width: 1184px\) \{[\s\S]*?\.ui-editor-split \{[^}]*display:\s*none/);
  });
});

describe("편집 도구줄은 한 줄이다(제목 중복·여러 줄 헤더 없음)", () => {
  const block = /@media not all and \(max-width: 1184px\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";

  it("도구줄 높이는 48~56 (간격 토큰 48 + 안쪽 여백) 이고 화면 높이 고정에서는 줄바꿈하지 않는다", () => {
    expect(prop(".ui-toolbar", "min-height")).toBe("var(--sp-7)");
    expect(space[7]).toBeGreaterThanOrEqual(48);
    const height = Math.max(space[7], component.button.height + space[1] * 2 + 2); // 단추 40 + 위아래 여백 4×2 + 테두리 2
    expect(height).toBeGreaterThanOrEqual(48);
    expect(height).toBeLessThanOrEqual(56);
    expect(block).toMatch(/\.ui-page\.is-fit \.ui-toolbar \{[^}]*flex-wrap:\s*nowrap/);
    expect(block).toMatch(/\.ui-page\.is-fit \.ui-toolbar \{[^}]*flex:\s*none/);
  });

  it("덱 제목 칸은 테두리 없는 글자처럼 보이고, 규격 선택은 폭이 자동이다", () => {
    expect(prop(".ui-toolbar-title", "border-color")).toBe("transparent");
    expect(prop(".ui-toolbar-title", "background")).toBe("transparent");
    expect(prop(".ui-toolbar .ui-select", "width")).toBe("auto");
  });

  it("메뉴 면은 떠 있는 어두운 면(raised)이고 글자·경고 색은 대비 4.5 이상 쌍이다", () => {
    expect(prop(".ui-menu-panel", "position")).toBe("absolute");
    expect(prop(".ui-menu-panel", "background")).toBe("var(--c-raised)");
    expect(prop(".ui-menu-item", "color")).toBe("var(--c-text)");
    expect(prop(".ui-menu-item.is-alert", "color")).toBe("var(--c-alert)");
    expect(prop(".ui-menu-item[disabled]", "color")).toBe("var(--c-text-mute)");
    const has = (fg: string, bg: string) => contrastPairs.some((p) => p.fg === fg && p.bg === bg && p.min >= 4.5);
    expect(has("alert", "raised")).toBe(true);
    expect(has("textMute", "raised")).toBe(true);
  });

  it("화면 제목 숨김은 눈에만 안 보인다(보조기기에는 읽힌다)", () => {
    const r = rule(".ui-sr-only");
    expect(r).not.toMatch(/display\s*:\s*none/);
    expect(r).not.toMatch(/visibility\s*:\s*hidden/);
    expect(prop(".ui-sr-only", "position")).toBe("absolute");
  });
});
