import { describe, expect, it } from "vitest";
import { DEVICE_SIZES, IMAGE_QUALITY, IMAGE_SIZES } from "./image-config";
import { emptyMedia, heroMedia, media } from "./media";

const widthsIn = (set: string) => [...set.matchAll(/[&?]w=(\d+)/g)].map((m) => Number(m[1]));
const allowed = new Set([...IMAGE_SIZES, ...DEVICE_SIZES]);

describe("이미지 주소", () => {
  it("고정 폭은 1x·2x 로 가장 가까운 허용 폭을 쓴다", () => {
    const m = media("/api/cards/a-01", { width: 448, height: 597 });
    expect(m.srcSet).toBe(`/_next/image?url=%2Fapi%2Fcards%2Fa-01&w=448&q=${IMAGE_QUALITY} 1x, /_next/image?url=%2Fapi%2Fcards%2Fa-01&w=896&q=${IMAGE_QUALITY} 2x`);
    expect(m.src).toContain("w=896");
  });

  it("가변 폭은 w 기준 srcset 과 sizes 를 준다", () => {
    const m = heroMedia("/img/hero.jpg", { width: 1600, height: 1066 }, true);
    expect(widthsIn(m.srcSet ?? "")).toEqual(DEVICE_SIZES);
    expect(m.sizes).toBe("(min-width: 1184px) 60vw, 100vw");
    expect(m.priority).toBe(true);
  });

  it("만든 모든 폭·품질은 최적화기 허용 목록 안이다(밖이면 400)", () => {
    const all = [media("/a", { width: 48, height: 60 }), media("/a", { width: 128, height: 128 }), media("/a", { width: 448, height: 560 }), heroMedia("/a", { width: 1600, height: 900 }), emptyMedia()];
    for (const m of all) for (const w of [...widthsIn(m.src), ...widthsIn(m.srcSet ?? "")]) expect(allowed.has(w), `w=${w}`).toBe(true);
    for (const m of all) expect(m.src).toContain(`q=${IMAGE_QUALITY}`);
  });

  it("그릴 크기 속성(width·height)은 그대로 넘겨 자리를 미리 잡는다", () => {
    expect(emptyMedia()).toMatchObject({ width: 128, height: 128, priority: false });
  });
});
