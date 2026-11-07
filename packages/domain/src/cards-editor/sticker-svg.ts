// [cards] 스티커 → SVG 문자열. 편집 화면(<img src=data:…>)과 PNG 내보내기(캔버스 drawImage)가 같은 그림을 쓴다.
// 상자 크기(w×h, 원본 픽셀)를 viewBox 로 쓰므로 늘려도 선이 뭉개지지 않는다. 외부 자원·foreignObject 를 쓰지 않아 캔버스가 오염되지 않는다.
import type { StickerLayer } from "./deck";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function label(l: Pick<StickerLayer, "label" | "labelColor">, cx: number, cy: number, size: number): string {
  if (!l.label) return "";
  return `<text x="${cx}" y="${cy}" fill="${l.labelColor}" font-family="sans-serif" font-weight="800" font-size="${size}" text-anchor="middle" dominant-baseline="central">${esc(l.label)}</text>`;
}

export function stickerSvg(l: Pick<StickerLayer, "shape" | "fill" | "label" | "labelColor" | "w" | "h">): string {
  const w = Math.max(1, Math.round(l.w));
  const h = Math.max(1, Math.round(l.h));
  const m = Math.min(w, h);
  let body = "";
  switch (l.shape) {
    case "rect":
      body = `<rect x="0" y="0" width="${w}" height="${h}" rx="${m * 0.12}" fill="${l.fill}"/>${label(l, w / 2, h / 2, m * 0.4)}`;
      break;
    case "circle":
      body = `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2}" ry="${h / 2}" fill="${l.fill}"/>${label(l, w / 2, h / 2, m * 0.4)}`;
      break;
    case "arrow": {
      const t = h * 0.32;
      const head = Math.min(w * 0.45, h);
      body = `<polygon points="0,${h / 2 - t / 2} ${w - head},${h / 2 - t / 2} ${w - head},0 ${w},${h / 2} ${w - head},${h} ${w - head},${h / 2 + t / 2} 0,${h / 2 + t / 2}" fill="${l.fill}"/>`;
      break;
    }
    case "bubble": {
      const bh = h * 0.78;
      body = `<rect x="0" y="0" width="${w}" height="${bh}" rx="${Math.min(bh, w) * 0.3}" fill="${l.fill}"/><polygon points="${w * 0.2},${bh - 1} ${w * 0.38},${bh - 1} ${w * 0.16},${h}" fill="${l.fill}"/>${label(l, w / 2, bh / 2, Math.min(bh * 0.4, (w / Math.max(2, l.label.length)) * 1.2))}`;
      break;
    }
    case "badge":
      body = `<rect x="0" y="0" width="${w}" height="${h}" rx="${h / 2}" fill="${l.fill}"/>${label(l, w / 2, h / 2, Math.min(h * 0.5, (w / Math.max(2, l.label.length)) * 1.3))}`;
      break;
    case "star": {
      const pts: string[] = [];
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 0.4 : 1;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        pts.push(`${(w / 2 + (Math.cos(a) * r * w) / 2).toFixed(1)},${(h / 2 + (Math.sin(a) * r * h) / 2).toFixed(1)}`);
      }
      body = `<polygon points="${pts.join(" ")}" fill="${l.fill}"/>`;
      break;
    }
    case "emoji":
      body = `<text x="${w / 2}" y="${h / 2}" font-size="${m * 0.85}" text-anchor="middle" dominant-baseline="central">${esc(l.label)}</text>`;
      break;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
}

export const stickerDataUrl = (l: Parameters<typeof stickerSvg>[0]): string => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(stickerSvg(l))}`;
