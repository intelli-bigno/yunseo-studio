// [cards] 카드 한 장 → 캔버스 그리기(PNG 내보내기). 원본 픽셀 크기로 그리고, 줄바꿈은 도메인 wrapText 로 화면과 맞춘다.
// 캔버스·그림 읽기는 주입받는다 — 테스트는 기록용 가짜 컨텍스트로 순서를 검사한다.
import { CARD_PRESETS, imageFilter, stickerDataUrl, watermarkAnchors, wrapText, type CardFont, type CardPresetId, type DeckCard, type ImageLayer, type OverlayLayer, type TextLayer, type Watermark } from "@yunseo/domain";

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
  /** 이미지 보정·흐림(없으면 보정 없이 그린다) */
  filter?: string;
  /** 덮개 블렌드 */
  globalCompositeOperation?: string;
  createLinearGradient?(x0: number, y0: number, x1: number, y1: number): GradientLike;
  createRadialGradient?(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): GradientLike;
}
export interface GradientLike {
  addColorStop(offset: number, color: string): void;
}

export interface LoadedImage {
  img: unknown;
  width: number;
  height: number;
}

/**
 * 이미지를 상자에 맞출 원본 잘라내기(cover)·자리(contain). 화면 CSS(object-fit·object-position·scale(zoom) 원점 = 같은 자리)와 같은 결과.
 * cover: 보이는 자리 posX·posY 쪽을 남기고, zoom 만큼 더 잘라낸다. contain: 상자 안 자리 posX·posY, zoom 은 그 자리 기준 확대(상자 밖은 잘린다).
 */
export function fitImage(iw: number, ih: number, layer: Pick<ImageLayer, "x" | "y" | "w" | "h" | "fit"> & Partial<Pick<ImageLayer, "posX" | "posY" | "zoom">>) {
  const px = layer.posX ?? 0.5;
  const py = layer.posY ?? 0.5;
  const zoom = Math.max(1, layer.zoom ?? 1);
  const boxR = layer.w / layer.h;
  const imgR = iw / ih;
  if (layer.fit === "cover") {
    const sw = (imgR > boxR ? ih * boxR : iw) / zoom;
    const sh = (imgR > boxR ? ih : iw / boxR) / zoom;
    return { sx: (iw - sw) * px, sy: (ih - sh) * py, sw, sh, dx: layer.x, dy: layer.y, dw: layer.w, dh: layer.h };
  }
  const bw = imgR > boxR ? layer.w : layer.h * imgR;
  const bh = imgR > boxR ? layer.w / imgR : layer.h;
  const ox = layer.x + layer.w * px;
  const oy = layer.y + layer.h * py;
  const bx = layer.x + (layer.w - bw) * px;
  const by = layer.y + (layer.h - bh) * py;
  return { sx: 0, sy: 0, sw: iw, sh: ih, dx: ox + (bx - ox) * zoom, dy: oy + (by - oy) * zoom, dw: bw * zoom, dh: bh * zoom };
}

/** 덮개 채움 — 단색이면 색 그대로, 그라데이션이면 캔버스 그라데이션(지원 안 하면 단색) */
function overlayFill(ctx: Ctx2D, l: OverlayLayer): string | GradientLike {
  if (l.gradient === "none") return l.color;
  const solid = rgba(l.color, 1);
  const clear = rgba(l.color, 0);
  if (l.gradient === "radial") {
    if (!ctx.createRadialGradient) return l.color;
    const cx = l.x + l.w / 2;
    const cy = l.y + l.h / 2;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(l.w, l.h) / 2);
    g.addColorStop(l.gradFrom, clear);
    g.addColorStop(l.gradTo, solid);
    return g;
  }
  if (!ctx.createLinearGradient) return l.color;
  const [x0, y0, x1, y1] =
    l.gradient === "to-top" ? [0, l.h, 0, 0] : l.gradient === "to-bottom" ? [0, 0, 0, l.h] : l.gradient === "to-left" ? [l.w, 0, 0, 0] : [0, 0, l.w, 0];
  const g = ctx.createLinearGradient(l.x + x0, l.y + y0, l.x + x1, l.y + y1);
  g.addColorStop(l.gradFrom, solid);
  g.addColorStop(l.gradTo, clear);
  return g;
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
      if (layer.blend !== "normal" && "globalCompositeOperation" in ctx) ctx.globalCompositeOperation = layer.blend;
      ctx.fillStyle = overlayFill(ctx, layer) as string;
      ctx.fillRect(layer.x, layer.y, layer.w, layer.h);
    } else if (layer.kind === "image") {
      const img = await deps.load(layer.src);
      if (img && img.width > 0 && img.height > 0) {
        const f = fitImage(img.width, img.height, layer);
        const filter = imageFilter(layer);
        if (filter && "filter" in ctx) ctx.filter = filter;
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
