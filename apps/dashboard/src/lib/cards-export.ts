// [cards] 카드 한 장 → 캔버스 그리기(PNG 내보내기). 원본 픽셀 크기로 그리고, 줄바꿈은 도메인 wrapText 로 화면과 맞춘다.
// 캔버스·그림 읽기는 주입받는다 — 테스트는 기록용 가짜 컨텍스트로 순서를 검사한다.
import { CARD_PRESETS, wrapText, type CardFont, type CardPresetId, type DeckCard, type ImageLayer } from "@yunseo/domain";

/** 쓰는 캔버스 2D API 만 */
export interface Ctx2D {
  fillStyle: string;
  globalAlpha: number;
  font: string;
  textAlign: string;
  textBaseline: string;
  fillRect(x: number, y: number, w: number, h: number): void;
  save(): void;
  restore(): void;
  beginPath(): void;
  rect(x: number, y: number, w: number, h: number): void;
  clip(): void;
  drawImage(img: unknown, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number): void;
  fillText(text: string, x: number, y: number): void;
  measureText(text: string): { width: number };
}

export interface LoadedImage {
  img: unknown;
  width: number;
  height: number;
}

/** 이미지를 상자에 맞출 원본 잘라내기(cover)·자리(contain) */
export function fitImage(iw: number, ih: number, layer: Pick<ImageLayer, "x" | "y" | "w" | "h" | "fit">) {
  const boxR = layer.w / layer.h;
  const imgR = iw / ih;
  if (layer.fit === "cover") {
    const sw = imgR > boxR ? ih * boxR : iw;
    const sh = imgR > boxR ? ih : iw / boxR;
    return { sx: (iw - sw) / 2, sy: (ih - sh) / 2, sw, sh, dx: layer.x, dy: layer.y, dw: layer.w, dh: layer.h };
  }
  const dw = imgR > boxR ? layer.w : layer.h * imgR;
  const dh = imgR > boxR ? layer.w / imgR : layer.h;
  return { sx: 0, sy: 0, sw: iw, sh: ih, dx: layer.x + (layer.w - dw) / 2, dy: layer.y + (layer.h - dh) / 2, dw, dh };
}

export async function drawCard(ctx: Ctx2D, card: DeckCard, preset: CardPresetId, deps: { load: (src: string) => Promise<LoadedImage | null>; family: (f: CardFont) => string }): Promise<void> {
  const { width, height } = CARD_PRESETS[preset];
  ctx.globalAlpha = 1;
  ctx.fillStyle = card.background;
  ctx.fillRect(0, 0, width, height);
  for (const layer of card.layers) {
    if (layer.hidden) continue;
    ctx.save();
    ctx.beginPath();
    ctx.rect(layer.x, layer.y, layer.w, layer.h);
    ctx.clip();
    if (layer.kind === "overlay") {
      ctx.globalAlpha = layer.opacity;
      ctx.fillStyle = "#000000";
      ctx.fillRect(layer.x, layer.y, layer.w, layer.h);
    } else if (layer.kind === "image") {
      const img = await deps.load(layer.src);
      if (img && img.width > 0 && img.height > 0) {
        const f = fitImage(img.width, img.height, layer);
        ctx.drawImage(img.img, f.sx, f.sy, f.sw, f.sh, f.dx, f.dy, f.dw, f.dh);
      }
    } else {
      ctx.font = `${layer.weight} ${layer.size}px ${deps.family(layer.font)}`;
      ctx.fillStyle = layer.color;
      ctx.textAlign = layer.align;
      ctx.textBaseline = "top";
      const lh = layer.size * layer.lineHeight;
      const x = layer.align === "left" ? layer.x : layer.align === "center" ? layer.x + layer.w / 2 : layer.x + layer.w;
      // CSS 줄 상자처럼 글자를 줄 높이 가운데에 둔다
      const pad = (lh - layer.size) / 2;
      wrapText(layer.text, layer.w, (s) => ctx.measureText(s).width).forEach((line, i) => ctx.fillText(line, x, layer.y + pad + i * lh));
    }
    ctx.restore();
  }
}

/** 내보내기 파일 이름 — 덱 제목 + 장 번호 */
export function exportName(title: string, index: number): string {
  const safe = title.replace(/[\\/:*?"<>|\s]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "deck";
  return `${safe}-${String(index + 1).padStart(2, "0")}.png`;
}
