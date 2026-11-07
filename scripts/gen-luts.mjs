// 릴스 색보정 LUT(.cube, 17³) 생성기 — 공식으로 만든 자체 LUT 라 저작권 걱정이 없다(CC0, assets/luts/LICENSE).
// 다시 만들기: node scripts/gen-luts.mjs  (결과는 바이트 단위로 같다 — 값은 소수 6자리로 고정)
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const N = 17;
const out = join(dirname(fileURLToPath(import.meta.url)), "..", "assets", "luts");
const clamp = (v) => Math.min(1, Math.max(0, v));
const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
/** 부드러운 S 곡선(대비) — 0·0.5·1 은 그대로 */
const s = (v, k) => clamp(v + k * (v - 0.5) * 4 * v * (1 - v));

const LUTS = {
  /** 따뜻한 필름 — 빨강·노랑 쪽으로, 파랑은 눌러 준다 */
  "film-warm": (r, g, b) => [clamp(r * 1.08 + 0.02), clamp(g * 1.02 + 0.01), clamp(b * 0.85)],
  /** 틸&오렌지 — 어두운 곳은 청록, 밝은 곳(피부)은 주황 */
  "teal-orange": (r, g, b) => {
    const y = luma(r, g, b);
    const t = y - 0.5; // -0.5(어둠) ~ 0.5(밝음)
    return [clamp(s(r, 0.15) + 0.12 * t), clamp(s(g, 0.15) + 0.02 * t), clamp(s(b, 0.15) - 0.14 * t)];
  },
  /** 흑백 — 휘도(BT.709)만 남긴다 */
  mono: (r, g, b) => {
    const y = clamp(luma(r, g, b));
    return [y, y, y];
  },
};

for (const [id, f] of Object.entries(LUTS)) {
  const lines = [`TITLE "${id}"`, "# yunseo-studio 자체 생성 LUT — CC0 1.0 (assets/luts/LICENSE)", `LUT_3D_SIZE ${N}`, "DOMAIN_MIN 0.0 0.0 0.0", "DOMAIN_MAX 1.0 1.0 1.0"];
  // .cube 순서: 빨강이 가장 빨리 바뀐다
  for (let bi = 0; bi < N; bi++) for (let gi = 0; gi < N; gi++) for (let ri = 0; ri < N; ri++) lines.push(f(ri / (N - 1), gi / (N - 1), bi / (N - 1)).map((v) => v.toFixed(6)).join(" "));
  writeFileSync(join(out, `${id}.cube`), `${lines.join("\n")}\n`);
}
