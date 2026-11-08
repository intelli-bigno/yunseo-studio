import { describe, expect, it } from "vitest";
import { DEVICE_SIZES, IMAGE_QUALITY, IMAGE_SIZES } from "./image-config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { emptyMedia, media, optimizableRef, REF_PRIORITY_COUNT, refLarge, refThumb } from "./media";

const widthsIn = (set: string) => [...set.matchAll(/[&?]w=(\d+)/g)].map((m) => Number(m[1]));
const allowed = new Set([...IMAGE_SIZES, ...DEVICE_SIZES]);

describe("이미지 주소", () => {
  it("고정 폭은 1x·2x 로 가장 가까운 허용 폭을 쓴다", () => {
    const m = media("/api/cards/a-01", { width: 448, height: 597 });
    expect(m.srcSet).toBe(`/_next/image?url=%2Fapi%2Fcards%2Fa-01&w=448&q=${IMAGE_QUALITY} 1x, /_next/image?url=%2Fapi%2Fcards%2Fa-01&w=896&q=${IMAGE_QUALITY} 2x`);
    expect(m.src).toContain("w=896");
  });

  it("lean: 1x 는 src, 2x 만 srcset — 고정 폭 기본 동작(1x·2x 둘 다 srcset)은 그대로", () => {
    const lean = media("/a", { width: 224, height: 280, lean: true });
    expect(lean.src).toContain("w=256");
    expect(lean.srcSet).toMatch(/^[^,]+w=448[^,]* 2x$/);
    expect(media("/a", { width: 224, height: 280 }).srcSet).toContain(" 1x, ");
  });

  it("가변 폭은 w 기준 srcset 과 sizes 를 준다", () => {
    const m = media("/img/a.jpg", { width: 1600, height: 1066, sizes: "(min-width: 1184px) 60vw, 100vw", priority: true });
    expect(widthsIn(m.srcSet ?? "")).toEqual(DEVICE_SIZES);
    expect(m.sizes).toBe("(min-width: 1184px) 60vw, 100vw");
    expect(m.priority).toBe(true);
  });

  it("만든 모든 폭·품질은 최적화기 허용 목록 안이다(밖이면 400)", () => {
    const all = [media("/a", { width: 48, height: 60 }), media("/a", { width: 128, height: 128 }), media("/a", { width: 448, height: 560 }), media("/a", { width: 1600, height: 900, sizes: "100vw" }), emptyMedia()];
    for (const m of all) for (const w of [...widthsIn(m.src), ...widthsIn(m.srcSet ?? "")]) expect(allowed.has(w), `w=${w}`).toBe(true);
    for (const m of all) expect(m.src).toContain(`q=${IMAGE_QUALITY}`);
  });

  it("그릴 크기 속성(width·height)은 그대로 넘겨 자리를 미리 잡는다", () => {
    expect(emptyMedia()).toMatchObject({ width: 128, height: 128, priority: false });
  });
});

describe("레퍼런스 썸네일", () => {
  const pin = "https://i.pinimg.com/736x/fe/53/21/fe532102b6a1c4ce13fd37be48e717a6.jpg";
  const cap = "/api/refs/card-reference/capture/ref-01.jpg";

  it("핀터레스트·저장소 캡처는 작은 WebP 1x 256 / 2x 448 로 받는다(원본 주소는 url 인자로)", () => {
    for (const src of [pin, cap]) {
      const m = refThumb(src);
      // 1x 는 src, srcset 에는 2x 하나 — 같은 주소를 세 번 싣지 않는다(칸 수백 개의 HTML·RSC 크기)
      expect(m.src).toBe(`/_next/image?url=${encodeURIComponent(src)}&w=256&q=${IMAGE_QUALITY}`);
      expect(m.srcSet).toBe(`/_next/image?url=${encodeURIComponent(src)}&w=448&q=${IMAGE_QUALITY} 2x`);
      expect(m.priority).toBe(false);
    }
    expect(refThumb(pin, true).priority).toBe(true);
  });

  it("비교 칸은 448/896", () => {
    expect(widthsIn(refLarge(pin).src)).toEqual([448]);
    expect(widthsIn(refLarge(pin).srcSet ?? "")).toEqual([896]);
  });

  it("최적화기가 모르는 주소(다른 호스트·다른 경로)는 원본 그대로 — 400 으로 깨지지 않게", () => {
    for (const src of ["https://example.com/a.jpg", "http://i.pinimg.com/736x/a.jpg", "https://i.pinimg.com/originals/a.jpg", "/api/reels/P-261105-a001/aaaaaa/cover", "/api/refs/../etc/passwd"]) {
      expect(optimizableRef(src), src).toBe(false);
      const m = refThumb(src);
      expect(m.src).toBe(src);
      expect(m.srcSet).toBeUndefined();
    }
  });

  it("만든 폭은 허용 목록 안이고, next.config.ts 의 허용 목록이 같은 주소를 연다", () => {
    for (const m of [refThumb(pin), refLarge(pin), refThumb(cap)]) for (const w of [...widthsIn(m.src), ...widthsIn(m.srcSet ?? "")]) expect(allowed.has(w), `w=${w}`).toBe(true);
    const cfg = readFileSync(resolve(__dirname, "../../next.config.ts"), "utf8");
    expect(cfg).toContain('hostname: "i.pinimg.com"');
    expect(cfg).toContain('pathname: "/736x/**"');
    expect(cfg).toContain('pathname: "/api/refs/**"');
  });

  it("첫 화면 즉시 받는 칸 수는 작은 상수다(나머지는 지연)", () => {
    expect(REF_PRIORITY_COUNT).toBeGreaterThan(0);
    expect(REF_PRIORITY_COUNT).toBeLessThanOrEqual(12);
  });
});
