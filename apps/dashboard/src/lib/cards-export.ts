// [cards] 카드 한 장 → 캔버스 그리기(PNG 내보내기). 원본 픽셀 크기로 그리고, 줄바꿈은 도메인 wrapText 로 화면과 맞춘다.
// 캔버스·그림 읽기는 주입받는다 — 테스트는 기록용 가짜 컨텍스트로 순서를 검사한다.
import { CARD_PRESETS, stickerDataUrl, watermarkAnchors, wrapText, type CardFont, type CardPresetId, type DeckCard, type ImageLayer, type TextLayer, type Watermark } from "@yunseo/domain";

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
  translate(x: number, y: number): void;
  rotate(rad: number): void;
  /** 최신 브라우저만 — 없으면 자간 없이 그린다 */
  letterSpacing?: string;
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

type Deps = { load: (src: string) => Promise<LoadedImage | null>; family: (f: CardFont) => string };

const rgba = (hex: string, a: number) => `rgba(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)}, ${a})`;

/** 글자 배치 — 바깥 여백(margin) 안에 배경 상자, 안쪽 여백(padding) 안에 줄들. 세로 정렬은 줄 묶음 전체를 옮긴다 */
export function textLayout(layer: TextLayer, measure: (s: string) => number) {
  const box = { x: layer.x + layer.margin, y: layer.y + layer.margin, w: Math.max(0, layer.w - layer.margin * 2), h: Math.max(0, layer.h - layer.margin * 2) };
  const inner = { x: box.x + layer.padding, y: box.y + layer.padding, w: Math.max(1, box.w - layer.padding * 2), h: Math.max(0, box.h - layer.padding * 2) };
  const lh = layer.size * layer.lineHeight;
  const lines = wrapText(layer.text, inner.w, measure);
  const total = lines.length * lh;
  const top = layer.vAlign === "top" ? inner.y : layer.vAlign === "middle" ? inner.y + (inner.h - total) / 2 : inner.y + inner.h - total;
  const x = layer.align === "left" ? inner.x : layer.align === "center" ? inner.x + inner.w / 2 : inner.x + inner.w;
  const pad = (lh - layer.size) / 2; // CSS 줄 상자처럼 글자를 줄 높이 가운데에 둔다
  return { box, lines: lines.map((t, i) => ({ text: t, x, y: top + pad + i * lh })) };
}

export async function drawCard(ctx: Ctx2D, card: DeckCard, preset: CardPresetId, deps: Deps, watermark: Watermark | null = null): Promise<void> {
  const { width, height } = CARD_PRESETS[preset];
  ctx.globalAlpha = 1;
  ctx.fillStyle = card.background;
  ctx.fillRect(0, 0, width, height);
  for (const layer of card.layers) {
    if (layer.hidden) continue;
    ctx.save();
    if (layer.rotation) {
      const cx = layer.x + layer.w / 2;
      const cy = layer.y + layer.h / 2;
      ctx.translate(cx, cy);
      ctx.rotate((layer.rotation * Math.PI) / 180);
      ctx.translate(-cx, -cy);
    }
    ctx.beginPath();
    ctx.rect(layer.x, layer.y, layer.w, layer.h);
    ctx.clip();
    if (layer.kind === "overlay") {
      ctx.globalAlpha = layer.opacity;
      ctx.fillStyle = layer.color;
      ctx.fillRect(layer.x, layer.y, layer.w, layer.h);
    } else if (layer.kind === "image") {
      const img = await deps.load(layer.src);
      if (img && img.width > 0 && img.height > 0) {
        const f = fitImage(img.width, img.height, layer);
        ctx.drawImage(img.img, f.sx, f.sy, f.sw, f.sh, f.dx, f.dy, f.dw, f.dh);
      }
    } else if (layer.kind === "sticker") {
      const img = await deps.load(stickerDataUrl(layer));
      if (img) {
        ctx.globalAlpha = layer.opacity;
        ctx.drawImage(img.img, 0, 0, img.width, img.height, layer.x, layer.y, layer.w, layer.h);
      }
    } else {
      ctx.font = `${layer.weight} ${layer.size}px ${deps.family(layer.font)}`;
      if (layer.letterSpacing && "letterSpacing" in ctx) ctx.letterSpacing = `${layer.letterSpacing}px`;
      const t = textLayout(layer, (s) => ctx.measureText(s).width);
      if (layer.boxOpacity > 0) {
        ctx.fillStyle = rgba(layer.boxColor, layer.boxOpacity);
        ctx.fillRect(t.box.x, t.box.y, t.box.w, t.box.h);
      }
      ctx.fillStyle = layer.color;
      ctx.textAlign = layer.align;
      ctx.textBaseline = "top";
      for (const line of t.lines) ctx.fillText(line.text, line.x, line.y);
    }
    ctx.restore();
  }
  if (watermark) await drawWatermark(ctx, watermark, preset, deps);
}

async function drawWatermark(ctx: Ctx2D, wm: Watermark, preset: CardPresetId, deps: Deps): Promise<void> {
  const img = wm.kind === "image" && wm.src ? await deps.load(wm.src) : null;
  if (wm.kind === "image" && !img) return;
  ctx.save();
  ctx.globalAlpha = wm.opacity;
  ctx.font = `700 ${wm.size}px ${deps.family("sans")}`;
  ctx.fillStyle = wm.color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const iw = img ? wm.size : ctx.measureText(wm.text).width;
  const ih = img ? (wm.size * img.height) / Math.max(1, img.width) : wm.size;
  for (const p of watermarkAnchors(wm, preset, iw, ih)) {
    ctx.save();
    ctx.translate(p.x, p.y);
    if (wm.tile && wm.angle) ctx.rotate((wm.angle * Math.PI) / 180);
    if (img) ctx.drawImage(img.img, 0, 0, img.width, img.height, -iw / 2, -ih / 2, iw, ih);
    else ctx.fillText(wm.text, 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

/** 내보내기 파일 이름 — 덱 제목 + 장 번호 */
export function exportName(title: string, index: number): string {
  const safe = title.replace(/[\\/:*?"<>|\s]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "deck";
  return `${safe}-${String(index + 1).padStart(2, "0")}.png`;
}
