// 카드 편집기 화면 예산 — 1440×900 에서 캔버스 높이 560 이상(헤더가 높이를 먹어 154×192 로 줄던 문제의 재발 방지).
// 값은 디자인 토큰과 styles.css 에서 읽고, CSS 규칙(여백·열 폭·도구줄·덱 줄)이 가정과 같은지도 함께 본다.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CARD_PRESETS } from "../packages/domain/src/index";
import { component, layout, space } from "../packages/design-tokens/src/index";

const css = readFileSync(join(fileURLToPath(new URL("..", import.meta.url)), "packages/ui/src/styles.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const fit = /@media not all and \(max-width: 1184px\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";

describe("카드 편집기 화면 예산 (화면 높이 고정 모드)", () => {
  it("CSS 가정: 페이지 여백 12/16, 편집기 칸 사이 12, 왼쪽 패널 폭 3×64, 오른쪽 기본 40%", () => {
    expect(fit).toMatch(/\.ui-page\.is-fit \{[^}]*padding:\s*var\(--sp-3\) var\(--sp-4\)/);
    expect(fit).toMatch(/\.ui-page\.is-fit \.ui-editor \{[^}]*gap:\s*var\(--sp-3\)/);
    expect(css).toMatch(/\.ui-editor \{ --ed-left: calc\(var\(--sp-8\) \* 3\);/);
    expect(css).toMatch(/var\(--ed-right, 40%\)/);
    expect(fit).toMatch(/\.ui-page\.is-fit \.ui-deck-bar \{[^}]*padding:\s*var\(--sp-2\) var\(--sp-3\)/);
    expect(fit).toMatch(/\.ui-page\.is-fit \.ui-editor-stage \{[^}]*padding:\s*var\(--sp-3\)/);
  });

  it("1440×900: 4:5 캔버스 높이가 560 이상이다", () => {
    const [vw, vh] = [1440, 900];
    // 가로 — 사이드바 뒤 본문에서 페이지 여백·패널·칸 사이를 뺀 가운데 칸, 거기서 캔버스 칸 안쪽 여백
    const editorW = vw - layout.sidebar - space[4] * 2;
    const centerW = editorW - space[8] * 3 - editorW * 0.4 - space[3] * 2;
    const canvasMaxW = centerW - space[3] * 2;
    // 세로 — 상단바·페이지 위아래 여백·도구줄·칸 사이 뒤 편집기 높이, 거기서 덱 줄(+칸 사이)과 캔버스 칸 안쪽 여백
    const toolbarH = component.button.height + space[1] * 2 + 2;
    const editorH = vh - layout.topbar - space[3] * 2 - toolbarH - space[3];
    const thumbH = space[8] * 1.25 + 2; // 썸네일(규격 상관없이 같은 높이) + 테두리
    const stripH = Math.max(thumbH + space[1] + 28 + space[1], 28 * 3 + space[1] * 2) + space[2] * 2 + 2; // 번호·도구 줄 28(아이콘 단추), 덱 줄 여백 8×2, 테두리 2
    const canvasMaxH = editorH - space[3] - stripH - space[3] * 2;
    const { width, height } = CARD_PRESETS["4:5"];
    const canvasH = Math.min(canvasMaxH, canvasMaxW * (height / width));
    expect(canvasH).toBeGreaterThanOrEqual(560);
  });

  it("도구줄은 화면 제목(PageHeader)을 따로 두지 않는다 — 화면 제목은 보조기기용으로만", () => {
    const page = readFileSync(join(fileURLToPath(new URL("..", import.meta.url)), "apps/dashboard/src/app/cards/page.tsx"), "utf8");
    expect(page).not.toContain("PageHeader");
    expect(page).toContain("<HiddenTitle>");
  });
});
