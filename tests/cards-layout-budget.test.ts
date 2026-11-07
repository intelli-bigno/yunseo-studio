// 카드 편집기 화면 예산 — 레퍼런스 우선(그리드 ≥ 패널 높이의 50%) · 캔버스 1440×900 에서 높이 560 이상 · 장 목록 6장 이상.
// 값은 디자인 토큰과 styles.css 에서 읽고, CSS 규칙(여백·열 폭·도구줄·덱 줄·시트 상한)이 가정과 같은지도 함께 본다.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CARD_PRESETS } from "../packages/domain/src/index";
import { component, layout, space } from "../packages/design-tokens/src/index";

const css = readFileSync(join(fileURLToPath(new URL("..", import.meta.url)), "packages/ui/src/styles.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const fit = /@media not all and \(max-width: 1184px\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";

// ── 화면 모델(px) ──
const toolbarH = component.button.height + space[1] * 2 + 2;
const editorH = (vh: number) => vh - layout.topbar - space[3] * 2 - toolbarH - space[3];
const editorW = (vw: number) => vw - layout.sidebar - space[4] * 2;
const centerW = (vw: number) => editorW(vw) - space[8] * 3 - editorW(vw) * 0.4 - space[3] * 2; // 왼쪽 패널 3×64 · 오른쪽 기본 40% · 칸 사이 12×2
// 장 목록 — 썸네일 높이 56(규격 상관없이 같다) + 번호 줄 + 스크롤바(처음부터 높이에 포함) + 덱 줄 여백 8×2 · 테두리 2
const thumbH = space[8] * 0.875;
const scrollH = space[1] * 1.5;
const wrapH = thumbH + space[1] + space[4];
const stripInnerH = wrapH + scrollH;
const stripH = stripInnerH + space[2] * 2 + 2;
// 동작 단추 열 — 아이콘 24 정사각 + 위쪽 틈, 왼쪽 여백 8 + 구분선 1
const actionsW = space[5] + space[2] + 1;
const actionsH = space[5] * 3 + (space[1] / 2) * 2;
// 오른쪽 패널 — 접기 줄(여백 8×2 + 글자 줄 16 + 선 1) 아래가 본문(고정 바 + 레퍼런스 그리드 + 속성 시트)
const panelH = (vh: number) => editorH(vh) - (space[2] * 2 + 16 + 1) - 2;
// 패널 안 flex 열(styles.css 와 같은 규칙): 바 = flex none, 그리드 = flex 1 0 50%, 시트 = flex 0 1 auto(최소 머리 줄 · 최대 45%).
// 바 높이·시트 내용 높이를 어떤 값으로 줘도 그리드가 패널의 절반 아래로 줄지 않는지 본다(상수 가정 없음)
const flexColumn = (h: number, bar: number, sheetContent: number) => {
  const sheetBase = Math.min(Math.max(sheetContent, component.button.height), h * 0.45);
  const sheetMin = component.button.height;
  const gridBase = h * 0.5;
  const free = h - bar - gridBase - sheetBase;
  if (free >= 0) return { grid: gridBase + free, sheet: sheetBase }; // 남으면 그리드가 키운다(flex-grow 1)
  return { grid: gridBase, sheet: Math.max(sheetMin, sheetBase + free) }; // 모자라면 시트만 줄어든다(그리드·바는 shrink 0)
};

describe("카드 편집기 화면 예산 (화면 높이 고정 모드)", () => {
  it("CSS 가정: 페이지 여백 12/16, 편집기 칸 사이 12, 왼쪽 패널 폭 3×64, 오른쪽 기본 40%", () => {
    expect(fit).toMatch(/\.ui-page\.is-fit \{[^}]*padding:\s*var\(--sp-3\) var\(--sp-4\)/);
    expect(fit).toMatch(/\.ui-page\.is-fit \.ui-editor \{[^}]*gap:\s*var\(--sp-3\)/);
    expect(css).toMatch(/\.ui-editor \{ --ed-left: calc\(var\(--sp-8\) \* 3\);/);
    expect(css).toMatch(/var\(--ed-right, 40%\)/);
    expect(fit).toMatch(/\.ui-page\.is-fit \.ui-deck-bar \{[^}]*padding:\s*var\(--sp-2\) var\(--sp-3\)/);
    expect(fit).toMatch(/\.ui-page\.is-fit \.ui-editor-stage \{[^}]*padding:\s*var\(--sp-3\)/);
  });

  it("CSS 가정: 장 목록 썸네일 56 · 스크롤바 6(높이에 포함) · 동작 단추는 24 아이콘", () => {
    expect(fit).toMatch(/--ed-thumb:\s*calc\(var\(--sp-8\) \* 0\.875\)/);
    expect(fit).toMatch(/--ed-scroll:\s*calc\(var\(--sp-1\) \* 1\.5\)/);
    expect(fit).toMatch(/\.ui-page\.is-fit \.ui-deck-strip \{[^}]*height:\s*calc\(var\(--ed-thumb\) \+ var\(--sp-1\) \+ var\(--sp-4\) \+ var\(--ed-scroll\)\)/);
    expect(fit).toMatch(/\.ui-page\.is-fit \.ui-deck-strip \{[^}]*overflow-y:\s*hidden/);
    expect(fit).toMatch(/\.ui-page\.is-fit \.ui-deck-actions \.ui-btn \{[^}]*width:\s*var\(--sp-5\);[^}]*height:\s*var\(--sp-5\)/);
    expect(fit).toMatch(/\.ui-page\.is-fit \.ui-deck-action-text \{[^}]*display:\s*none/);
    expect(css).toMatch(/\.ui-deck-strip::-webkit-scrollbar \{[^}]*height:\s*var\(--ed-scroll/); // 얇은 스크롤바(Firefox 는 scrollbar-width: thin)
    expect(css).toMatch(/scrollbar-width:\s*thin/);
    expect(actionsH).toBeLessThanOrEqual(stripInnerH); // 동작 단추 3개가 장 목록 줄 안에 들어간다
  });

  it("1440×900: 4:5 캔버스 높이가 560 이상이다", () => {
    const [vw, vh] = [1440, 900];
    const canvasMaxW = centerW(vw) - space[3] * 2; // 캔버스 칸 안쪽 여백
    const canvasMaxH = editorH(vh) - space[3] - stripH - space[3] * 2;
    const { width, height } = CARD_PRESETS["4:5"];
    const canvasH = Math.min(canvasMaxH, canvasMaxW * (height / width));
    expect(canvasH).toBeGreaterThanOrEqual(560);
  });

  it.each([
    [1440, "4:5", 6],
    [1440, "1:1", 6],
    [1280, "4:5", 6],
  ] as const)("%i 폭에서 %s 장 목록은 %i장 이상 한 번에 보인다", (vw, id, min) => {
    const { width, height } = CARD_PRESETS[id];
    const thumbW = Math.max(thumbH * (width / height), space[6]); // 번호가 들어갈 최소 폭 32
    const room = centerW(vw) - (space[3] * 2 + 2) - actionsW - space[2]; // 덱 줄 안쪽 여백·테두리, 동작 단추 열, 둘 사이 틈
    const visible = Math.floor((room + space[2]) / (thumbW + space[2]));
    expect(visible).toBeGreaterThanOrEqual(min);
  });

  it("CSS 가정: 바는 스크롤 밖 flex 항목 · 그리드 본문은 flex 1 0 50% · 시트만 줄어든다(상수 없음)", () => {
    expect(css).not.toContain("--ed-bar");
    expect(css).toMatch(/\.ui-editor-side-main > \.ui-panel-bar \{[^}]*flex:\s*none/);
    expect(css).toMatch(/\.ui-editor-side-body\.is-grid \{[^}]*flex:\s*1 0 50%/);
    expect(css).toMatch(/\.ui-sheet \{[^}]*flex:\s*0 1 auto;[^}]*min-height:\s*var\(--button-height\);[^}]*max-height:\s*45%/);
  });

  it.each([[1440, 900], [1280, 800]] as const)("%i×%i: 바가 몇 줄이든 시트를 열어도 레퍼런스 그리드가 패널 높이의 50%% 이상이다", (vw, vh) => {
    expect(vw).toBeGreaterThan(1184); // 화면 높이 고정 모드 폭
    const h = panelH(vh);
    for (const bar of [63, 113, 160, 220]) {
      for (const content of [0, 200, 640, 2000]) {
        const { grid, sheet } = flexColumn(h, bar, content);
        expect(grid).toBeGreaterThanOrEqual(h * 0.5);
        expect(sheet).toBeLessThanOrEqual(h * 0.45);
        expect(sheet).toBeGreaterThanOrEqual(component.button.height);
      }
    }
  });

  it.each([[1440, "4:5"], [1440, "1:1"], [1280, "4:5"], [1280, "1:1"]] as const)("%i 폭에서 %s 장 7개가 모두 보인다(썸네일이 폭에 맞춰 줄어든다)", (vw, id) => {
    const n = 7;
    const { width, height } = CARD_PRESETS[id];
    const room = centerW(vw) - (space[3] * 2 + 2) - actionsW - space[2];
    const fit = (room - n * space[2]) / n; // CSS --ed-fit: (100cqw − n×틈) / n
    const thumbW = Math.min(thumbH * (width / height), Math.max(space[6], fit));
    const total = n * Math.max(thumbW, space[6]) + (n - 1) * space[2];
    expect(total).toBeLessThanOrEqual(room);
  });

  it("CSS 가정: 장 목록은 컨테이너(inline-size)이고 썸네일 폭은 min(기본, max(32, --ed-fit)) · 장 수는 --deck-n", () => {
    expect(fit).toMatch(/\.ui-page\.is-fit \.ui-deck-strip \{[^}]*--ed-fit:\s*calc\(\(100cqw - var\(--deck-n, 1\) \* var\(--sp-2\)\) \/ var\(--deck-n, 1\)\)/);
    expect(fit).toMatch(/\.ui-page\.is-fit \.ui-deck-strip \{[^}]*container-type:\s*inline-size/);
    expect(fit).toMatch(/\.ui-page\.is-fit \.ui-deck-thumb \{[^}]*width:\s*min\(calc\(var\(--ed-thumb\) \* var\(--ar, 0\.8\)\), max\(var\(--sp-6\), var\(--ed-fit\)\)\)/);
  });

  it("CSS 가정: 검색 줄은 줄바꿈하고 검색창은 최소 폭 160 을 지키며, 묶음·개수는 한 묶음으로 내려간다", () => {
    expect(css).toMatch(/\.ui-panel-bar \.ui-row \{[^}]*flex-wrap:\s*wrap/);
    expect(css).toMatch(/\.ui-panel-bar \.ui-row > \.ui-input \{[^}]*min-width:\s*calc\(var\(--sp-8\) \* 2\.5\)/);
    expect(css).toMatch(/\.ui-panel-bar \.ui-row > \.ui-row \{[^}]*flex-wrap:\s*nowrap/);
    expect(space[8] * 2.5).toBeGreaterThanOrEqual(160);
  });

  it("도구줄은 화면 제목(PageHeader)을 따로 두지 않는다 — 화면 제목은 보조기기용으로만", () => {
    const page = readFileSync(join(fileURLToPath(new URL("..", import.meta.url)), "apps/dashboard/src/app/cards/page.tsx"), "utf8");
    expect(page).not.toContain("PageHeader");
    expect(page).toContain("<HiddenTitle>");
  });
});
