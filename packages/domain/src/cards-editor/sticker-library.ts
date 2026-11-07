// [cards] 고급 스티커 라이브러리 — 매거진·금융 에디토리얼 톤(라벨 태그·리본·숫자 배지·인용·화살표·하이라이트·말풍선·도장·프레임).
// 스티커 하나 = 그리기 함수 하나. 상자 크기(w×h, 원본 픽셀)를 viewBox 로 쓰고, 색·테두리·모서리·그림자·글자를 레이어 값으로 받는다.
// 편집 화면(<img src=data:…>)과 PNG 내보내기(캔버스 drawImage)가 같은 SVG 를 쓴다. 외부 자원·foreignObject 없음(캔버스 오염 방지).

export const STICKER_GROUPS = ["tag", "ribbon", "number", "quote", "arrow", "highlight", "bubble", "stamp", "frame", "accent"] as const;
export type StickerGroup = (typeof STICKER_GROUPS)[number];
export const STICKER_GROUP_LABEL: Record<StickerGroup, string> = {
  tag: "라벨 태그",
  ribbon: "리본",
  number: "숫자 배지",
  quote: "인용",
  arrow: "화살표",
  highlight: "하이라이트",
  bubble: "말풍선",
  stamp: "도장",
  frame: "프레임",
  accent: "장식",
};

/** 레이어가 고칠 수 있는 겉모양 값 */
export interface StickerLook {
  fill: string;
  label: string;
  labelColor: string;
  stroke: string;
  /** 테두리 두께(원본 픽셀, 0 = 없음) */
  strokeWidth: number;
  /** 모서리 둥글기 0~1(짧은 변 절반 대비) */
  radius: number;
  /** 그림자 진하기 0~1 */
  shadow: number;
  w: number;
  h: number;
}

export interface StickerDef {
  id: string;
  name: string;
  group: StickerGroup;
  /** 가로 ÷ 세로 */
  aspect: number;
  /** 기본 겉모양 */
  look: Omit<StickerLook, "w" | "h">;
  /** 글자를 쓰는 스티커인가(속성 패널에 글자 칸을 띄운다) */
  hasLabel: boolean;
}

const SANS = "Pretendard, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif";
const SERIF = "'Noto Serif KR', 'Nanum Myeongjo', 'AppleMyungjo', Georgia, serif";
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const f1 = (n: number) => Math.round(n * 10) / 10;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Ctx extends StickerLook {
  /** 그림자·테두리 여백을 뺀 그릴 자리 */
  b: Box;
  m: number;
  /** 모서리 반지름(픽셀) */
  r: number;
  /** 테두리 속성 문자열(없으면 "") */
  st: string;
}

/** 글자 — 줄바꿈(\n) 지원, 상자(maxW×maxH) 안에 들어가게 크기를 줄인다 */
function text(c: Ctx, value: string, cx: number, cy: number, maxW: number, maxH: number, o: { color?: string; weight?: number; serif?: boolean; spacing?: number; anchor?: "start" | "middle" | "end"; italic?: boolean; size?: number } = {}): string {
  if (!value) return "";
  const lines = value.split("\n").slice(0, 4);
  const longest = Math.max(1, ...lines.map((l) => [...l].reduce((n, ch) => n + (/[ -~]/.test(ch) ? 0.62 : 1), 0)));
  const sp = o.spacing ?? 0;
  const byW = maxW / (longest * (1 + sp));
  const byH = maxH / (lines.length * 1.18);
  const size = f1(Math.max(4, Math.min(o.size ?? Infinity, byW, byH)));
  const lh = size * 1.18;
  const top = cy - ((lines.length - 1) * lh) / 2;
  const anchor = o.anchor ?? "middle";
  const tspans = lines.map((l, i) => `<tspan x="${f1(cx)}" y="${f1(top + i * lh)}">${esc(l)}</tspan>`).join("");
  return `<text fill="${o.color ?? c.labelColor}" font-family="${esc(o.serif ? SERIF : SANS)}" font-weight="${o.weight ?? 800}"${o.italic ? ' font-style="italic"' : ""} font-size="${size}"${sp ? ` letter-spacing="${f1(size * sp)}"` : ""} text-anchor="${anchor}" dominant-baseline="central">${tspans}</text>`;
}
const rr = (c: Ctx, b: Box, r = c.r, fill = c.fill, extra = c.st) => `<rect x="${f1(b.x)}" y="${f1(b.y)}" width="${f1(b.w)}" height="${f1(b.h)}" rx="${f1(Math.min(r, b.w / 2, b.h / 2))}" fill="${fill}"${extra}/>`;
const poly = (pts: [number, number][], fill: string, extra = "") => `<polygon points="${pts.map(([x, y]) => `${f1(x)},${f1(y)}`).join(" ")}" fill="${fill}"${extra}/>`;
const path = (d: string, fill: string, extra = "") => `<path d="${d}" fill="${fill}"${extra}/>`;
const line = (c: Ctx, w: number, color = c.fill) => ` stroke="${color}" stroke-width="${f1(w)}" stroke-linecap="round" stroke-linejoin="round" fill="none"`;
const center = (b: Box) => ({ cx: b.x + b.w / 2, cy: b.y + b.h / 2 });
const inset = (b: Box, d: number): Box => ({ x: b.x + d, y: b.y + d, w: Math.max(1, b.w - d * 2), h: Math.max(1, b.h - d * 2) });

/** 별·도장 톱니 같은 방사형 점들 */
function radial(cx: number, cy: number, rx: number, ry: number, n: number, inner: number, rot = -Math.PI / 2): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < n * 2; i++) {
    const k = i % 2 ? inner : 1;
    const a = rot + (i * Math.PI) / n;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return pts;
}

type Draw = (c: Ctx) => string;
interface Entry extends StickerDef {
  draw: Draw;
}

const INK = "#111111";
const PAPER = "#f7f3ea";
const BRASS = "#c9a227";
const RED = "#d64545";
const NAVY = "#14213d";
const GREEN = "#1f9d6b";
const WHITE = "#ffffff";

const def = (id: string, name: string, group: StickerGroup, aspect: number, look: Partial<StickerDef["look"]>, draw: Draw, hasLabel = true): Entry => ({
  id,
  name,
  group,
  aspect,
  hasLabel,
  look: { fill: INK, label: "", labelColor: WHITE, stroke: INK, strokeWidth: 0, radius: 0, shadow: 0, ...look },
  draw,
});

const LIB: Entry[] = [
  // ── 라벨 태그 ──
  def("tag-solid", "단색 태그", "tag", 3, { fill: INK, label: "MARKET", labelColor: WHITE, radius: 0.08 }, (c) => rr(c, c.b) + text(c, c.label, center(c.b).cx, center(c.b).cy, c.b.w * 0.82, c.b.h * 0.56, { spacing: 0.12 })),
  def("tag-outline", "테두리 태그", "tag", 3, { fill: "none", label: "ANALYSIS", labelColor: INK, stroke: INK, strokeWidth: 4, radius: 0.08 }, (c) => rr(c, c.b, c.r, c.fill === "none" ? "none" : c.fill) + text(c, c.label, center(c.b).cx, center(c.b).cy, c.b.w * 0.8, c.b.h * 0.5, { spacing: 0.14, weight: 700 })),
  def("tag-pill", "알약 태그", "tag", 3.2, { fill: BRASS, label: "오늘의 포인트", labelColor: INK, radius: 1 }, (c) => rr(c, c.b) + text(c, c.label, center(c.b).cx, center(c.b).cy, c.b.w * 0.8, c.b.h * 0.52)),
  def("tag-price", "가격표", "tag", 2.4, { fill: PAPER, label: "$4.2T", labelColor: INK, stroke: INK, strokeWidth: 3, radius: 0.12 }, (c) => {
    const { x, y, w, h } = c.b;
    const n = h * 0.42;
    const d = `M${f1(x + n)},${f1(y)} H${f1(x + w - c.r)} Q${f1(x + w)},${f1(y)} ${f1(x + w)},${f1(y + c.r)} V${f1(y + h - c.r)} Q${f1(x + w)},${f1(y + h)} ${f1(x + w - c.r)},${f1(y + h)} H${f1(x + n)} L${f1(x)},${f1(y + h / 2)} Z`;
    return path(d, c.fill, c.st) + `<circle cx="${f1(x + n * 0.75)}" cy="${f1(y + h / 2)}" r="${f1(h * 0.08)}" fill="${c.labelColor}"/>` + text(c, c.label, x + n + (w - n) / 2, y + h / 2, (w - n) * 0.8, h * 0.56);
  }),
  def("tag-kicker", "키커(꼭지 제목)", "tag", 4, { fill: RED, label: "BREAKING", labelColor: INK }, (c) => {
    const { x, y, w, h } = c.b;
    return rr(c, { x, y: y + h * 0.2, w: h * 0.6, h: h * 0.6 }, c.r) + text(c, c.label, x + h * 0.85, y + h / 2, w - h * 0.95, h * 0.62, { anchor: "start", spacing: 0.16, weight: 900 }) + `<rect x="${f1(x)}" y="${f1(y + h - Math.max(2, h * 0.05))}" width="${f1(w)}" height="${f1(Math.max(2, h * 0.05))}" fill="${c.labelColor}"/>`;
  }),
  def("tag-split", "두 칸 태그", "tag", 3.4, { fill: NAVY, label: "Q3|실적", labelColor: WHITE, radius: 0.1 }, (c) => {
    const { x, y, w, h } = c.b;
    const [a = "", b = ""] = c.label.split("|");
    const lw = w * 0.34;
    return rr(c, c.b) + `<rect x="${f1(x + lw)}" y="${f1(y)}" width="${f1(w - lw)}" height="${f1(h)}" fill="${WHITE}" opacity="0.94"/>` + rr(c, c.b, c.r, "none") + text(c, a, x + lw / 2, y + h / 2, lw * 0.78, h * 0.56, { weight: 900 }) + text(c, b, x + lw + (w - lw) / 2, y + h / 2, (w - lw) * 0.8, h * 0.52, { color: c.fill, weight: 800 });
  }),
  def("tag-corner", "접힌 모서리 라벨", "tag", 2.6, { fill: PAPER, label: "EDITOR'S PICK", labelColor: INK }, (c) => {
    const { x, y, w, h } = c.b;
    const k = h * 0.34;
    return poly([[x, y], [x + w - k, y], [x + w, y + k], [x + w, y + h], [x, y + h]], c.fill, c.st) + poly([[x + w - k, y], [x + w - k, y + k], [x + w, y + k]], c.labelColor, ' opacity="0.18"') + text(c, c.label, x + w / 2, y + h / 2, w * 0.8, h * 0.44, { spacing: 0.1 });
  }),

  // ── 리본 ──
  def("ribbon-banner", "제비꼬리 리본", "ribbon", 4.2, { fill: RED, label: "TOP STORY", labelColor: WHITE }, (c) => {
    const { x, y, w, h } = c.b;
    const n = h * 0.4;
    return poly([[x, y], [x + w, y], [x + w - n, y + h / 2], [x + w, y + h], [x, y + h], [x + n, y + h / 2]], c.fill, c.st) + text(c, c.label, x + w / 2, y + h / 2, w - n * 2.6, h * 0.56, { spacing: 0.1 });
  }),
  def("ribbon-fold", "접힌 리본", "ribbon", 4.4, { fill: NAVY, label: "SPECIAL REPORT", labelColor: WHITE }, (c) => {
    const { x, y, w, h } = c.b;
    const e = w * 0.12;
    const t = h * 0.2;
    const top = y + t;
    const bh = h - t * 2;
    return (
      poly([[x, top + t], [x + e, top + t], [x + e, top + bh + t], [x, top + bh + t], [x + e * 0.4, top + t + bh / 2]], c.fill, ' opacity="0.72"') +
      poly([[x + w, top + t], [x + w - e, top + t], [x + w - e, top + bh + t], [x + w, top + bh + t], [x + w - e * 0.4, top + t + bh / 2]], c.fill, ' opacity="0.72"') +
      poly([[x + e, top + bh], [x + e * 1.9, top + bh], [x + e * 1.9, top + bh + t]], INK, ' opacity="0.5"') +
      poly([[x + w - e, top + bh], [x + w - e * 1.9, top + bh], [x + w - e * 1.9, top + bh + t]], INK, ' opacity="0.5"') +
      `<rect x="${f1(x + e * 0.9)}" y="${f1(top)}" width="${f1(w - e * 1.8)}" height="${f1(bh)}" fill="${c.fill}"${c.st}/>` +
      text(c, c.label, x + w / 2, top + bh / 2, w - e * 2.6, bh * 0.56, { spacing: 0.08 })
    );
  }),
  def("ribbon-corner", "모서리 띠", "ribbon", 1, { fill: BRASS, label: "NEW", labelColor: INK }, (c) => {
    const { x, y, w, h } = c.b;
    const t = Math.min(w, h) * 0.22;
    return poly([[x + w * 0.38, y], [x + w * 0.38 + t * 1.41, y], [x + w, y + h * 0.62 - t * 1.41], [x + w, y + h * 0.62]], c.fill, c.st) + `<g transform="rotate(45 ${f1(x + w * 0.69 + t * 0.35)} ${f1(y + h * 0.31 - t * 0.35)})">${text(c, c.label, x + w * 0.69 + t * 0.35, y + h * 0.31 - t * 0.35, w * 0.6, t * 0.62, { spacing: 0.14 })}</g>`;
  }),
  def("ribbon-bookmark", "책갈피", "ribbon", 0.5, { fill: RED, label: "01", labelColor: WHITE }, (c) => {
    const { x, y, w, h } = c.b;
    return poly([[x, y], [x + w, y], [x + w, y + h], [x + w / 2, y + h - w * 0.45], [x, y + h]], c.fill, c.st) + text(c, c.label, x + w / 2, y + h * 0.36, w * 0.74, h * 0.3, { weight: 900 });
  }),

  // ── 숫자 배지 ──
  def("num-circle", "숫자 원", "number", 1, { fill: INK, label: "01", labelColor: WHITE }, (c) => {
    const { cx, cy } = center(c.b);
    return `<ellipse cx="${f1(cx)}" cy="${f1(cy)}" rx="${f1(c.b.w / 2)}" ry="${f1(c.b.h / 2)}" fill="${c.fill}"${c.st}/>` + text(c, c.label, cx, cy, c.b.w * 0.66, c.b.h * 0.5, { weight: 900 });
  }),
  def("num-ring", "숫자 링", "number", 1, { fill: "none", label: "3", labelColor: INK, stroke: INK, strokeWidth: 5 }, (c) => {
    const { cx, cy } = center(c.b);
    return `<ellipse cx="${f1(cx)}" cy="${f1(cy)}" rx="${f1(c.b.w / 2)}" ry="${f1(c.b.h / 2)}" fill="${c.fill}"${c.st || line(c, c.m * 0.04, INK)}/>` + text(c, c.label, cx, cy, c.b.w * 0.6, c.b.h * 0.56, { serif: true, weight: 700 });
  }),
  def("num-square", "숫자 사각", "number", 1, { fill: BRASS, label: "02", labelColor: INK, radius: 0.14 }, (c) => rr(c, c.b) + text(c, c.label, center(c.b).cx, center(c.b).cy, c.b.w * 0.7, c.b.h * 0.56, { weight: 900 })),
  def("num-big", "큰 숫자(명조)", "number", 0.8, { fill: "none", label: "7", labelColor: INK }, (c) => text(c, c.label, center(c.b).cx, center(c.b).cy, c.b.w, c.b.h * 1.05, { serif: true, weight: 700 })),
  def("num-up", "상승 수치", "number", 3, { fill: GREEN, label: "+12.4%", labelColor: WHITE, radius: 1 }, (c) => {
    const { x, y, w, h } = c.b;
    const t = h * 0.3;
    const tx = x + h * 0.55;
    return rr(c, c.b) + poly([[tx - t / 2, y + h / 2 + t * 0.35], [tx + t / 2, y + h / 2 + t * 0.35], [tx, y + h / 2 - t * 0.5]], c.labelColor) + text(c, c.label, x + h * 0.95 + (w - h * 1.2) / 2, y + h / 2, w - h * 1.3, h * 0.56, { weight: 900 });
  }),
  def("num-down", "하락 수치", "number", 3, { fill: RED, label: "−3.2%", labelColor: WHITE, radius: 1 }, (c) => {
    const { x, y, w, h } = c.b;
    const t = h * 0.3;
    const tx = x + h * 0.55;
    return rr(c, c.b) + poly([[tx - t / 2, y + h / 2 - t * 0.35], [tx + t / 2, y + h / 2 - t * 0.35], [tx, y + h / 2 + t * 0.5]], c.labelColor) + text(c, c.label, x + h * 0.95 + (w - h * 1.2) / 2, y + h / 2, w - h * 1.3, h * 0.56, { weight: 900 });
  }),
  def("num-rank", "순위(No.)", "number", 1.4, { fill: "none", label: "No.1", labelColor: INK, stroke: INK }, (c) => {
    const { x, y, w, h } = c.b;
    const sw = Math.max(2, c.m * 0.03);
    return `<line x1="${f1(x)}" y1="${f1(y + sw)}" x2="${f1(x + w)}" y2="${f1(y + sw)}"${line(c, sw, c.stroke)}/><line x1="${f1(x)}" y1="${f1(y + h - sw)}" x2="${f1(x + w)}" y2="${f1(y + h - sw)}"${line(c, sw, c.stroke)}/>` + text(c, c.label, x + w / 2, y + h / 2, w * 0.92, h * 0.66, { serif: true, weight: 700, italic: true });
  }),
  def("num-step", "단계(STEP)", "number", 2.6, { fill: INK, label: "STEP|01", labelColor: WHITE, radius: 0.1 }, (c) => {
    const { x, y, w, h } = c.b;
    const [a = "", b = ""] = c.label.split("|");
    return rr(c, c.b) + text(c, a, x + w * 0.34, y + h / 2, w * 0.46, h * 0.36, { spacing: 0.18, weight: 600 }) + `<line x1="${f1(x + w * 0.62)}" y1="${f1(y + h * 0.25)}" x2="${f1(x + w * 0.62)}" y2="${f1(y + h * 0.75)}"${line(c, Math.max(1.5, h * 0.03), c.labelColor)} opacity="0.5"/>` + text(c, b, x + w * 0.81, y + h / 2, w * 0.3, h * 0.6, { weight: 900 });
  }),

  // ── 인용 ──
  def("quote-marks", "큰 따옴표", "quote", 1.2, { fill: BRASS, label: "", labelColor: INK }, (c) => text(c, "“", center(c.b).cx, c.b.y + c.b.h * 0.62, c.b.w * 1.6, c.b.h * 1.5, { serif: true, weight: 700, color: c.fill }), false),
  def("quote-block", "인용 블록", "quote", 2.6, { fill: BRASS, label: "“시장은 늘\n미래를 먼저 산다”", labelColor: INK }, (c) => {
    const { x, y, w, h } = c.b;
    const bw = Math.max(3, w * 0.025);
    return `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(bw)}" height="${f1(h)}" fill="${c.fill}"/>` + text(c, c.label, x + bw * 3, y + h / 2, w - bw * 4, h * 0.9, { serif: true, weight: 700, anchor: "start" });
  }),
  def("quote-card", "인용 카드", "quote", 1.8, { fill: PAPER, label: "숫자보다\n흐름을 보라", labelColor: INK, radius: 0.06, shadow: 0.25 }, (c) => {
    const { x, y, w, h } = c.b;
    return rr(c, c.b) + text(c, "“", x + h * 0.2, y + h * 0.26, h * 0.6, h * 0.5, { serif: true, weight: 700, color: BRASS, anchor: "start" }) + text(c, c.label, x + w / 2, y + h * 0.58, w * 0.78, h * 0.6, { serif: true, weight: 700 });
  }),
  def("quote-pull", "풀쿼트", "quote", 2.4, { fill: "none", label: "금리는 결국\n방향의 문제다", labelColor: INK, stroke: INK }, (c) => {
    const { x, y, w, h } = c.b;
    const sw = Math.max(2, h * 0.02);
    return `<line x1="${f1(x)}" y1="${f1(y + sw)}" x2="${f1(x + w)}" y2="${f1(y + sw)}"${line(c, sw, c.stroke)}/><line x1="${f1(x)}" y1="${f1(y + h - sw)}" x2="${f1(x + w)}" y2="${f1(y + h - sw)}"${line(c, sw, c.stroke)}/>` + text(c, c.label, x + w / 2, y + h / 2, w * 0.92, h * 0.74, { serif: true, weight: 700, italic: true });
  }),
  def("quote-source", "출처 꼬리표", "quote", 4, { fill: "none", label: "— 파월 연준 의장", labelColor: INK }, (c) => text(c, c.label, c.b.x, center(c.b).cy, c.b.w, c.b.h * 0.6, { anchor: "start", weight: 600 })),

  // ── 화살표 ──
  def("arrow-solid", "굵은 화살표", "arrow", 2.5, { fill: INK }, (c) => {
    const { x, y, w, h } = c.b;
    const t = h * 0.34;
    const hd = Math.min(w * 0.45, h);
    return poly([[x, y + h / 2 - t / 2], [x + w - hd, y + h / 2 - t / 2], [x + w - hd, y], [x + w, y + h / 2], [x + w - hd, y + h], [x + w - hd, y + h / 2 + t / 2], [x, y + h / 2 + t / 2]], c.fill, c.st);
  }, false),
  def("arrow-line", "가는 화살표", "arrow", 3, { fill: INK }, (c) => {
    const { x, y, w, h } = c.b;
    const sw = Math.max(2, h * 0.08);
    const hd = Math.min(w * 0.2, h * 0.5);
    return `<path d="M${f1(x + sw)},${f1(y + h / 2)} H${f1(x + w - sw)} M${f1(x + w - hd)},${f1(y + h / 2 - hd)} L${f1(x + w - sw)},${f1(y + h / 2)} L${f1(x + w - hd)},${f1(y + h / 2 + hd)}"${line(c, sw)}/>`;
  }, false),
  def("arrow-curve", "곡선 화살표", "arrow", 1.6, { fill: INK }, (c) => {
    const { x, y, w, h } = c.b;
    const sw = Math.max(2, c.m * 0.06);
    const ex = x + w - sw;
    const ey = y + h * 0.3;
    const hd = c.m * 0.22;
    return `<path d="M${f1(x + sw)},${f1(y + h - sw)} C${f1(x + w * 0.2)},${f1(y + h * 0.2)} ${f1(x + w * 0.6)},${f1(y + h * 0.1)} ${f1(ex)},${f1(ey)}"${line(c, sw)}/><path d="M${f1(ex - hd)},${f1(ey - hd * 0.5)} L${f1(ex)},${f1(ey)} L${f1(ex - hd * 0.6)},${f1(ey + hd * 0.85)}"${line(c, sw)}/>`;
  }, false),
  def("arrow-trend", "상승 추세선", "arrow", 1.6, { fill: GREEN }, (c) => {
    const { x, y, w, h } = c.b;
    const sw = Math.max(2, c.m * 0.07);
    const pts: [number, number][] = [[x + sw, y + h * 0.85], [x + w * 0.3, y + h * 0.55], [x + w * 0.5, y + h * 0.7], [x + w - sw * 1.5, y + h * 0.15]];
    const [ex, ey] = pts[3]!;
    const hd = c.m * 0.24;
    return `<polyline points="${pts.map(([a, b]) => `${f1(a)},${f1(b)}`).join(" ")}"${line(c, sw)}/><path d="M${f1(ex - hd)},${f1(ey)} L${f1(ex)},${f1(ey)} L${f1(ex)},${f1(ey + hd)}"${line(c, sw)}/>`;
  }, false),
  def("arrow-chevrons", "겹 꺾쇠", "arrow", 2.4, { fill: BRASS }, (c) => {
    const { x, y, w, h } = c.b;
    const sw = Math.max(2, h * 0.14);
    const step = w / 3;
    return [0, 1, 2].map((i) => `<path d="M${f1(x + step * i + sw)},${f1(y + sw)} L${f1(x + step * i + step - sw)},${f1(y + h / 2)} L${f1(x + step * i + sw)},${f1(y + h - sw)}"${line(c, sw)} opacity="${[0.4, 0.7, 1][i]}"/>`).join("");
  }, false),
  def("arrow-circle", "원 화살표", "arrow", 1, { fill: INK, labelColor: WHITE }, (c) => {
    const { cx, cy } = center(c.b);
    const r = c.m / 2;
    const sw = r * 0.14;
    return `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(r)}" fill="${c.fill}"${c.st}/><path d="M${f1(cx - r * 0.42)},${f1(cy)} H${f1(cx + r * 0.4)} M${f1(cx + r * 0.08)},${f1(cy - r * 0.32)} L${f1(cx + r * 0.4)},${f1(cy)} L${f1(cx + r * 0.08)},${f1(cy + r * 0.32)}"${line(c, sw, c.labelColor)}/>`;
  }, false),

  // ── 하이라이트 ──
  def("hl-marker", "형광펜", "highlight", 5, { fill: "#ffe14d", label: "", labelColor: INK }, (c) => {
    const { x, y, w, h } = c.b;
    const d = `M${f1(x + w * 0.02)},${f1(y + h * 0.18)} Q${f1(x + w * 0.5)},${f1(y + h * 0.02)} ${f1(x + w * 0.99)},${f1(y + h * 0.12)} L${f1(x + w * 0.97)},${f1(y + h * 0.9)} Q${f1(x + w * 0.5)},${f1(y + h * 0.98)} ${f1(x + w * 0.01)},${f1(y + h * 0.86)} Z`;
    return path(d, c.fill, ' opacity="0.85"') + text(c, c.label, x + w / 2, y + h / 2, w * 0.9, h * 0.66);
  }),
  def("hl-underline", "물결 밑줄", "highlight", 6, { fill: RED }, (c) => {
    const { x, y, w, h } = c.b;
    const sw = Math.max(2, h * 0.22);
    const n = Math.max(3, Math.round(w / (h * 1.4)));
    const step = (w - sw * 2) / n;
    let d = `M${f1(x + sw)},${f1(y + h / 2)}`;
    for (let i = 0; i < n; i++) d += ` q${f1(step / 4)},${f1(-h * 0.36)} ${f1(step / 2)},0 t${f1(step / 2)},0`;
    return `<path d="${d}"${line(c, sw)}/>`;
  }, false),
  def("hl-circle", "손그림 동그라미", "highlight", 1.8, { fill: RED }, (c) => {
    const { x, y, w, h } = c.b;
    const sw = Math.max(2, c.m * 0.05);
    const d = `M${f1(x + w * 0.62)},${f1(y + h * 0.06)} C${f1(x + w * 1.02)},${f1(y + h * 0.1)} ${f1(x + w * 1.0)},${f1(y + h * 0.92)} ${f1(x + w * 0.48)},${f1(y + h * 0.94)} C${f1(x - w * 0.02)},${f1(y + h * 0.96)} ${f1(x + w * 0.0)},${f1(y + h * 0.1)} ${f1(x + w * 0.5)},${f1(y + h * 0.08)} C${f1(x + w * 0.62)},${f1(y + h * 0.07)} ${f1(x + w * 0.7)},${f1(y + h * 0.12)} ${f1(x + w * 0.74)},${f1(y + h * 0.18)}`;
    return `<path d="${d}"${line(c, sw)}/>`;
  }, false),
  def("hl-box", "강조 상자", "highlight", 2.4, { fill: RED }, (c) => {
    const { x, y, w, h } = c.b;
    const sw = Math.max(2, c.m * 0.05);
    return `<path d="M${f1(x + sw)},${f1(y + sw * 1.4)} L${f1(x + w - sw * 0.6)},${f1(y + sw)} L${f1(x + w - sw)},${f1(y + h - sw * 1.2)} L${f1(x + sw * 1.3)},${f1(y + h - sw)} Z"${line(c, sw)}/>`;
  }, false),
  def("hl-burst", "폭발 배지", "highlight", 1, { fill: RED, label: "HOT", labelColor: WHITE }, (c) => {
    const { cx, cy } = center(c.b);
    return poly(radial(cx, cy, c.b.w / 2, c.b.h / 2, 14, 0.78), c.fill, c.st) + text(c, c.label, cx, cy, c.b.w * 0.56, c.b.h * 0.36, { weight: 900 });
  }),
  def("hl-sparkle", "반짝임", "highlight", 1, { fill: BRASS }, (c) => {
    const { cx, cy } = center(c.b);
    const big = poly(radial(cx, cy, c.b.w * 0.42, c.b.h * 0.5, 4, 0.18), c.fill, c.st);
    const small = poly(radial(c.b.x + c.b.w * 0.84, c.b.y + c.b.h * 0.18, c.b.w * 0.14, c.b.h * 0.16, 4, 0.2), c.fill);
    return big + small;
  }, false),

  // ── 말풍선 ──
  def("bubble-round", "둥근 말풍선", "bubble", 1.5, { fill: WHITE, label: "지금 사도\n될까요?", labelColor: INK, radius: 0.5, shadow: 0.2 }, (c) => {
    const { x, y, w, h } = c.b;
    const bh = h * 0.8;
    return rr(c, { x, y, w, h: bh }) + poly([[x + w * 0.2, y + bh - 1], [x + w * 0.38, y + bh - 1], [x + w * 0.14, y + h]], c.fill) + text(c, c.label, x + w / 2, y + bh / 2, w * 0.8, bh * 0.72);
  }),
  def("bubble-square", "각진 말풍선", "bubble", 1.6, { fill: INK, label: "핵심만\n짚어볼게요", labelColor: WHITE, radius: 0.06 }, (c) => {
    const { x, y, w, h } = c.b;
    const bh = h * 0.8;
    return rr(c, { x, y, w, h: bh }) + poly([[x + w * 0.7, y + bh - 1], [x + w * 0.86, y + bh - 1], [x + w * 0.88, y + h]], c.fill) + text(c, c.label, x + w / 2, y + bh / 2, w * 0.8, bh * 0.72);
  }),
  def("bubble-chat", "대화 알약", "bubble", 3, { fill: "#2f6fed", label: "이게 진짜 신호", labelColor: WHITE, radius: 1 }, (c) => {
    const { x, y, w, h } = c.b;
    const bw = w * 0.94;
    return rr(c, { x, y, w: bw, h }) + path(`M${f1(x + bw - h * 0.3)},${f1(y + h * 0.55)} Q${f1(x + w)},${f1(y + h)} ${f1(x + w)},${f1(y + h)} Q${f1(x + bw - h * 0.05)},${f1(y + h * 0.98)} ${f1(x + bw - h * 0.45)},${f1(y + h * 0.82)} Z`, c.fill) + text(c, c.label, x + bw / 2, y + h / 2, bw * 0.84, h * 0.52);
  }),
  def("bubble-thought", "생각 구름", "bubble", 1.5, { fill: WHITE, label: "음…", labelColor: INK, stroke: INK, strokeWidth: 3 }, (c) => {
    const { x, y, w, h } = c.b;
    const bh = h * 0.76;
    const bumps: [number, number, number][] = [[0.22, 0.42, 0.22], [0.42, 0.26, 0.26], [0.66, 0.28, 0.24], [0.8, 0.5, 0.2], [0.6, 0.66, 0.22], [0.34, 0.64, 0.22]];
    const cloud = bumps.map(([a, b, r]) => `<ellipse cx="${f1(x + w * a)}" cy="${f1(y + bh * b)}" rx="${f1(w * r)}" ry="${f1(bh * r * 1.15)}" fill="${c.fill}"${c.st}/>`).join("");
    const fillIn = bumps.map(([a, b, r]) => `<ellipse cx="${f1(x + w * a)}" cy="${f1(y + bh * b)}" rx="${f1(w * r - c.strokeWidth)}" ry="${f1(bh * r * 1.15 - c.strokeWidth)}" fill="${c.fill}"/>`).join("");
    const dots = `<circle cx="${f1(x + w * 0.2)}" cy="${f1(y + bh + h * 0.1)}" r="${f1(h * 0.06)}" fill="${c.fill}"${c.st}/><circle cx="${f1(x + w * 0.1)}" cy="${f1(y + h * 0.95)}" r="${f1(h * 0.035)}" fill="${c.fill}"${c.st}/>`;
    return cloud + fillIn + dots + text(c, c.label, x + w * 0.5, y + bh * 0.48, w * 0.6, bh * 0.5);
  }),
  def("bubble-shout", "외침 풍선", "bubble", 1.4, { fill: "#ffe14d", label: "급등!", labelColor: INK, stroke: INK, strokeWidth: 3 }, (c) => {
    const { cx, cy } = center(c.b);
    return poly(radial(cx, cy, c.b.w / 2, c.b.h / 2, 11, 0.72, -Math.PI / 2.3), c.fill, c.st) + text(c, c.label, cx, cy, c.b.w * 0.5, c.b.h * 0.36, { weight: 900 });
  }),

  // ── 도장 ──
  def("stamp-round", "원형 도장", "stamp", 1, { fill: "none", label: "VERIFIED", labelColor: RED, stroke: RED, strokeWidth: 0 }, (c) => {
    const { cx, cy } = center(c.b);
    const r = c.m / 2;
    const col = c.labelColor;
    return `<g opacity="0.92"><circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(r * 0.96)}" fill="${c.fill}" stroke="${col}" stroke-width="${f1(r * 0.07)}"/><circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(r * 0.8)}" fill="none" stroke="${col}" stroke-width="${f1(r * 0.025)}"/>${text(c, c.label, cx, cy, r * 1.3, r * 0.42, { weight: 900, spacing: 0.08 })}<circle cx="${f1(cx - r * 0.55)}" cy="${f1(cy)}" r="${f1(r * 0.04)}" fill="${col}"/><circle cx="${f1(cx + r * 0.55)}" cy="${f1(cy)}" r="${f1(r * 0.04)}" fill="${col}"/></g>`;
  }),
  def("stamp-rect", "사각 도장", "stamp", 2.6, { fill: "none", label: "CONFIRMED", labelColor: RED }, (c) => {
    const { x, y, w, h } = c.b;
    const col = c.labelColor;
    const sw = Math.max(2, h * 0.07);
    return `<g opacity="0.9"><rect x="${f1(x + sw / 2)}" y="${f1(y + sw / 2)}" width="${f1(w - sw)}" height="${f1(h - sw)}" rx="${f1(c.r)}" fill="${c.fill}" stroke="${col}" stroke-width="${f1(sw)}"/><rect x="${f1(x + sw * 2)}" y="${f1(y + sw * 2)}" width="${f1(w - sw * 4)}" height="${f1(h - sw * 4)}" rx="${f1(c.r * 0.6)}" fill="none" stroke="${col}" stroke-width="${f1(sw * 0.35)}"/>${text(c, c.label, x + w / 2, y + h / 2, w * 0.8, h * 0.48, { weight: 900, spacing: 0.12 })}</g>`;
  }),
  def("stamp-seal", "톱니 인장", "stamp", 1, { fill: BRASS, label: "BEST", labelColor: INK }, (c) => {
    const { cx, cy } = center(c.b);
    return poly(radial(cx, cy, c.b.w / 2, c.b.h / 2, 24, 0.9), c.fill, c.st) + `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(c.m * 0.36)}" fill="none" stroke="${c.labelColor}" stroke-width="${f1(c.m * 0.015)}" opacity="0.6"/>` + text(c, c.label, cx, cy, c.m * 0.56, c.m * 0.3, { weight: 900, serif: true });
  }),
  def("stamp-check", "체크 도장", "stamp", 1, { fill: GREEN, labelColor: WHITE }, (c) => {
    const { cx, cy } = center(c.b);
    const r = c.m / 2;
    return `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(r)}" fill="${c.fill}"${c.st}/><path d="M${f1(cx - r * 0.45)},${f1(cy + r * 0.02)} L${f1(cx - r * 0.12)},${f1(cy + r * 0.34)} L${f1(cx + r * 0.48)},${f1(cy - r * 0.32)}"${line(c, r * 0.16, c.labelColor)}/>`;
  }, false),
  def("stamp-date", "날짜 도장", "stamp", 2.2, { fill: "none", label: "2026.11.07", labelColor: NAVY }, (c) => {
    const { x, y, w, h } = c.b;
    const col = c.labelColor;
    const sw = Math.max(2, h * 0.05);
    return `<g opacity="0.88"><rect x="${f1(x + sw / 2)}" y="${f1(y + sw / 2)}" width="${f1(w - sw)}" height="${f1(h - sw)}" rx="${f1(Math.max(c.r, h * 0.12))}" fill="${c.fill}" stroke="${col}" stroke-width="${f1(sw)}"/>${text(c, c.label, x + w / 2, y + h / 2, w * 0.82, h * 0.5, { weight: 700, spacing: 0.06 })}</g>`;
  }),

  // ── 프레임 ──
  def("frame-line", "가는 테두리", "frame", 0.8, { fill: "none", stroke: WHITE, strokeWidth: 4 }, (c) => rr(c, c.b, c.r, "none", c.st || ` stroke="${WHITE}" stroke-width="4"`), false),
  def("frame-double", "이중 테두리", "frame", 0.8, { fill: "none", stroke: BRASS, strokeWidth: 4 }, (c) => {
    const sw = Math.max(1, c.strokeWidth || 4);
    return rr(c, c.b, c.r, "none", ` stroke="${c.stroke}" stroke-width="${f1(sw)}"`) + rr(c, inset(c.b, sw * 3), c.r * 0.8, "none", ` stroke="${c.stroke}" stroke-width="${f1(sw * 0.4)}"`);
  }, false),
  def("frame-corners", "모서리 꺾쇠", "frame", 0.8, { fill: "none", stroke: WHITE, strokeWidth: 6 }, (c) => {
    const { x, y, w, h } = c.b;
    const k = c.m * 0.18;
    const sw = Math.max(1, c.strokeWidth || 6);
    const ln = ` stroke="${c.stroke}" stroke-width="${f1(sw)}" stroke-linecap="square" fill="none"`;
    return `<path d="M${f1(x)},${f1(y + k)} V${f1(y)} H${f1(x + k)} M${f1(x + w - k)},${f1(y)} H${f1(x + w)} V${f1(y + k)} M${f1(x + w)},${f1(y + h - k)} V${f1(y + h)} H${f1(x + w - k)} M${f1(x + k)},${f1(y + h)} H${f1(x)} V${f1(y + h - k)}"${ln}/>`;
  }, false),
  def("frame-polaroid", "폴라로이드", "frame", 0.84, { fill: WHITE, label: "2026 · Q4", labelColor: INK, shadow: 0.3 }, (c) => {
    const { x, y, w, h } = c.b;
    const p = w * 0.06;
    const hole = { x: x + p, y: y + p, w: w - p * 2, h: h - p * 2 - h * 0.14 };
    const d = `M${f1(x)},${f1(y)} H${f1(x + w)} V${f1(y + h)} H${f1(x)} Z M${f1(hole.x)},${f1(hole.y)} V${f1(hole.y + hole.h)} H${f1(hole.x + hole.w)} V${f1(hole.y)} Z`;
    return path(d, c.fill, `${c.st} fill-rule="evenodd"`) + text(c, c.label, x + w / 2, y + h - h * 0.1, w * 0.8, h * 0.08, { weight: 600, serif: true });
  }),
  def("frame-tape", "마스킹 테이프", "frame", 3.6, { fill: "#e9dcc0", label: "", labelColor: INK }, (c) => {
    const { x, y, w, h } = c.b;
    const z = h * 0.12;
    const pts: [number, number][] = [];
    for (let i = 0; i <= 6; i++) pts.push([x + (i % 2 ? z : 0), y + (h * i) / 6]);
    for (let i = 6; i >= 0; i--) pts.push([x + w - (i % 2 ? z : 0), y + (h * i) / 6]);
    return poly(pts, c.fill, `${c.st} opacity="0.88"`) + text(c, c.label, x + w / 2, y + h / 2, w * 0.8, h * 0.56, { weight: 700 });
  }),

  // ── 장식 ──
  def("accent-divider", "점 구분선", "accent", 8, { fill: INK }, (c) => {
    const { x, y, w, h } = c.b;
    const sw = Math.max(1.5, h * 0.12);
    return `<line x1="${f1(x)}" y1="${f1(y + h / 2)}" x2="${f1(x + w / 2 - h)}" y2="${f1(y + h / 2)}"${line(c, sw)}/><line x1="${f1(x + w / 2 + h)}" y1="${f1(y + h / 2)}" x2="${f1(x + w)}" y2="${f1(y + h / 2)}"${line(c, sw)}/>` + poly([[x + w / 2, y + h * 0.15], [x + w / 2 + h * 0.35, y + h / 2], [x + w / 2, y + h * 0.85], [x + w / 2 - h * 0.35, y + h / 2]], c.fill);
  }, false),
  def("star", "별", "accent", 1, { fill: BRASS }, (c) => poly(radial(center(c.b).cx, center(c.b).cy, c.b.w / 2, c.b.h / 2, 5, 0.42), c.fill, c.st), false),
  def("badge", "배지", "accent", 2.4, { fill: RED, label: "NEW", labelColor: WHITE, radius: 1 }, (c) => rr(c, c.b) + text(c, c.label, center(c.b).cx, center(c.b).cy, c.b.w * 0.74, c.b.h * 0.52, { weight: 900, spacing: 0.08 })),
  def("accent-dots", "점 패턴", "accent", 1.6, { fill: INK }, (c) => {
    const { x, y, w, h } = c.b;
    const cols = 8;
    const rows = Math.max(2, Math.round((cols * h) / w));
    const r = Math.min(w / cols, h / rows) * 0.18;
    let s = "";
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) s += `<circle cx="${f1(x + (w / cols) * (i + 0.5))}" cy="${f1(y + (h / rows) * (j + 0.5))}" r="${f1(r)}" fill="${c.fill}"/>`;
    return s;
  }, false),
  def("accent-chart", "미니 막대 차트", "accent", 1.4, { fill: NAVY, labelColor: BRASS }, (c) => {
    const { x, y, w, h } = c.b;
    const v = [0.35, 0.5, 0.42, 0.7, 0.95];
    const bw = w / (v.length * 1.5);
    return v.map((k, i) => `<rect x="${f1(x + i * bw * 1.5 + bw * 0.25)}" y="${f1(y + h * (1 - k))}" width="${f1(bw)}" height="${f1(h * k)}" rx="${f1(Math.min(c.r, bw / 2))}" fill="${i === v.length - 1 ? c.labelColor : c.fill}"/>`).join("") + `<line x1="${f1(x)}" y1="${f1(y + h - 1)}" x2="${f1(x + w)}" y2="${f1(y + h - 1)}"${line(c, Math.max(1.5, h * 0.02), c.fill)}/>`;
  }, false),
];

export const STICKER_DEFS: readonly StickerDef[] = LIB.map((e) => ({ id: e.id, name: e.name, group: e.group, aspect: e.aspect, look: e.look, hasLabel: e.hasLabel }));
const BY_ID = new Map(LIB.map((e) => [e.id, e]));
export const stickerDef = (id: string): StickerDef | undefined => BY_ID.get(id);
export const isStickerId = (id: unknown): id is string => typeof id === "string" && BY_ID.has(id);

/** 라이브러리 스티커 → SVG 문자열 */
export function librarySvg(id: string, look: StickerLook): string {
  const e = BY_ID.get(id) ?? LIB[0]!;
  const w = Math.max(1, Math.round(look.w));
  const h = Math.max(1, Math.round(look.h));
  const shadow = Math.min(1, Math.max(0, look.shadow));
  const pad = look.strokeWidth / 2 + (shadow > 0 ? Math.min(w, h) * 0.06 : 0);
  const b: Box = { x: pad, y: pad, w: Math.max(1, w - pad * 2), h: Math.max(1, h - pad * 2 - (shadow > 0 ? Math.min(w, h) * 0.02 : 0)) };
  const m = Math.min(b.w, b.h);
  const st = look.strokeWidth > 0 ? ` stroke="${look.stroke}" stroke-width="${f1(look.strokeWidth)}" stroke-linejoin="round"` : "";
  const c: Ctx = { ...look, w, h, b, m, r: (Math.min(1, Math.max(0, look.radius)) * m) / 2, st };
  const body = e.draw(c);
  const filter = shadow > 0 ? `<defs><filter id="sh" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="${f1(m * 0.025)}" stdDeviation="${f1(m * 0.035)}" flood-color="#000" flood-opacity="${f1(shadow * 0.8)}"/></filter></defs>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${filter}${shadow > 0 ? `<g filter="url(#sh)">${body}</g>` : body}</svg>`;
}
