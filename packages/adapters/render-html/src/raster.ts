// 요소 트리 → PNG. satori 가 글자를 글리프 경로로 바꿔 SVG 를 만들고, resvg 가 래스터로 그린다.
// 브라우저·시스템 서체가 없다: 같은 입력이면 같은 바이트가 나온다(결정적). 이미지 생성·네트워크 호출 없음.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import satori from "satori";
import type { El } from "./layout";
import { CARD_HEIGHT, CARD_WIDTH, FONT_FAMILY } from "./theme";

const FONT_FILES = [
  { weight: 400, file: "Pretendard-Regular.woff" },
  { weight: 600, file: "Pretendard-SemiBold.woff" },
  { weight: 800, file: "Pretendard-ExtraBold.woff" },
] as const;

export interface Rasterizer {
  png(element: El): Promise<Uint8Array>;
}

export function createRasterizer(): Rasterizer {
  let fonts: { name: string; data: Buffer; weight: 400 | 600 | 800; style: "normal" }[] | undefined;
  const load = () =>
    (fonts ??= FONT_FILES.map(({ weight, file }) => ({
      name: FONT_FAMILY,
      data: readFileSync(fileURLToPath(new URL(`../fonts/${file}`, import.meta.url))),
      weight,
      style: "normal" as const,
    })));

  return {
    async png(element) {
      // satori 의 입력 타입은 React 요소다 — 우리는 같은 모양의 평범한 객체를 넘긴다
      const svg = await satori(element as unknown as Parameters<typeof satori>[0], { width: CARD_WIDTH, height: CARD_HEIGHT, fonts: load() });
      const resvg = new Resvg(svg, { fitTo: { mode: "width", value: CARD_WIDTH }, font: { loadSystemFonts: false } });
      return resvg.render().asPng();
    },
  };
}

/** PNG 머리글(IHDR)에서 가로·세로를 읽는다 — 규격 검사용 */
export function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.byteLength < 24 || sig.some((b, i) => bytes[i] !== b)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}
