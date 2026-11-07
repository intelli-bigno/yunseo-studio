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
// 오른쪽 패널 — 접기 줄(여백 8×2 + 글자 줄 16 + 선 1) 아래가 본문. 고정 바 = 여백 12×2 + 탭 줄(28+4×2+2) + 틈 8 + 검색 줄 40 + 선 1
const panelH = (vh: number) => editorH(vh) - (space[2] * 2 + 16 + 1) - 2;
const barReal = space[3] * 2 + (28 + space[1] * 2 + 2) + space[2] + component.input.height + 1;
const barVar = space[8] * 1.75;
const sheetCap = (h: number) => Math.max(component.button.height * 3, Math.min(h * 0.45, h * 0.5 - barVar));

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

  it.each([[1440, 900], [1280, 800]] as const)("%i×%i: 속성 시트를 열어도 레퍼런스 그리드(고정 바 아래)가 패널 높이의 50%% 이상 보인다", (vw, vh) => {
    expect(vw).toBeGreaterThan(1184); // 화면 높이 고정 모드 폭
    expect(barReal).toBeLessThanOrEqual(barVar); // CSS 의 바 높이 상수가 실제 바보다 작지 않다
    const h = panelH(vh);
    const sheet = sheetCap(h);
    expect(sheet).toBeLessThanOrEqual(h * 0.45); // 시트는 패널 높이의 최대 45%
    const grid = h - barReal - sheet;
    expect(grid).toBeGreaterThanOrEqual(h * 0.5);
    expect(sheet - component.button.height).toBeGreaterThan(0); // 머리 줄 아래 본문(내부 스크롤)이 남는다
  });

  it("도구줄은 화면 제목(PageHeader)을 따로 두지 않는다 — 화면 제목은 보조기기용으로만", () => {
    const page = readFileSync(join(fileURLToPath(new URL("..", import.meta.url)), "apps/dashboard/src/app/cards/page.tsx"), "utf8");
    expect(page).not.toContain("PageHeader");
    expect(page).toContain("<HiddenTitle>");
  });
});
