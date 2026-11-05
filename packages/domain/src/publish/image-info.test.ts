import { describe, expect, it } from "vitest";
import { probeImage } from "./image-info";

function png(width: number, height: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  b.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8); // IHDR
  const v = new DataView(b.buffer);
  v.setUint32(16, width);
  v.setUint32(20, height);
  return b;
}

function jpeg(width: number, height: number): Uint8Array {
  // SOI + APP0(길이 16) + SOF0(길이 17)
  const b = new Uint8Array(2 + 2 + 16 + 2 + 17);
  b.set([0xff, 0xd8], 0);
  b.set([0xff, 0xe0, 0x00, 0x10], 2);
  const sof = 2 + 2 + 16;
  b.set([0xff, 0xc0, 0x00, 0x11, 0x08], sof);
  const v = new DataView(b.buffer);
  v.setUint16(sof + 5, height);
  v.setUint16(sof + 7, width);
  return b;
}

describe("probeImage", () => {
  it("PNG IHDR 에서 크기를 읽는다", () => {
    expect(probeImage(png(1080, 1350))).toEqual({ format: "png", width: 1080, height: 1350 });
  });

  it("JPEG SOF 에서 크기를 읽는다", () => {
    expect(probeImage(jpeg(1080, 1350))).toEqual({ format: "jpeg", width: 1080, height: 1350 });
  });

  it("모르는 형식·짧은 입력은 null", () => {
    expect(probeImage(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(probeImage(new TextEncoder().encode("GIF89a........................"))).toBeNull();
  });
});
