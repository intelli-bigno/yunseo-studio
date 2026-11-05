import { describe, expect, it } from "vitest";
import { pngSize } from "./raster";

describe("pngSize", () => {
  it("PNG 머리글에서 가로·세로를 읽고, PNG 가 아니면 null", () => {
    const header = new Uint8Array(33);
    header.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    new DataView(header.buffer).setUint32(16, 1080);
    new DataView(header.buffer).setUint32(20, 1350);
    expect(pngSize(header)).toEqual({ width: 1080, height: 1350 });
    expect(pngSize(new Uint8Array(40))).toBeNull();
    expect(pngSize(new Uint8Array(4))).toBeNull();
  });
});
