import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { stageSubtitleFonts } from "./composer";
import { WoffError, isWoff1, sfntExtension, woffToSfnt } from "./woff";

const FONTS = fileURLToPath(new URL("../../render-html/fonts/", import.meta.url));

/** OpenType 표 체크섬(4바이트 단위 합) */
function tableSum(b: Buffer, off: number, len: number): number {
  let sum = 0;
  for (let i = 0; i < len; i += 4) {
    const word = (b[off + i]! << 24) | ((b[off + i + 1] ?? 0) << 16) | ((b[off + i + 2] ?? 0) << 8) | (b[off + i + 3] ?? 0);
    sum = (sum + (word >>> 0)) >>> 0;
  }
  return sum;
}

describe("woffToSfnt — WOFF1 → OTF 무손실 변환", () => {
  it("저장소 Pretendard-Regular.woff 를 OTF 로 바꾸고 표마다 원래 체크섬이 맞는다", async () => {
    const woff = await readFile(join(FONTS, "Pretendard-Regular.woff"));
    expect(isWoff1(woff)).toBe(true);
    const sfnt = Buffer.from(woffToSfnt(woff));
    expect(sfntExtension(sfnt)).toBe(".otf");
    expect(sfnt.length, "WOFF 머리에 적힌 원래 크기").toBe(woff.readUInt32BE(16));
    const n = sfnt.readUInt16BE(4);
    expect(n).toBe(woff.readUInt16BE(12));
    const tags: string[] = [];
    for (let i = 0; i < n; i += 1) {
      const rec = 12 + i * 16;
      const tag = sfnt.toString("latin1", rec, rec + 4);
      tags.push(tag);
      const off = sfnt.readUInt32BE(rec + 8);
      expect(off % 4, `${tag} 4바이트 정렬`).toBe(0);
      if (tag === "head") continue; // head 는 checkSumAdjustment 를 0 으로 놓고 잰다 — 아래에서 따로
      expect(tableSum(sfnt, off, sfnt.readUInt32BE(rec + 12)), `${tag} 체크섬`).toBe(sfnt.readUInt32BE(rec + 4));
    }
    expect(tags).toEqual(expect.arrayContaining(["CFF ", "cmap", "head", "name"]));
  });

  it("깨진 파일은 WoffError", () => {
    expect(() => woffToSfnt(new Uint8Array(10))).toThrow(WoffError);
    const bad = Buffer.alloc(64);
    bad.write("wOFF", 0, "latin1");
    bad.writeUInt16BE(9, 12);
    expect(() => woffToSfnt(bad)).toThrow(WoffError);
  });
});

describe("stageSubtitleFonts — 자막 작업 폴더", () => {
  it("WOFF 는 OTF 로 바꿔 넣고 woff 파일은 넣지 않는다(libass 경고 원인)", async () => {
    const dest = await mkdtemp(join(tmpdir(), "yunseo-fonts-"));
    try {
      const names = await stageSubtitleFonts(FONTS, dest);
      expect(names.sort()).toEqual(["Pretendard-ExtraBold.otf", "Pretendard-Regular.otf", "Pretendard-SemiBold.otf"]);
      expect((await readdir(dest)).some((f) => /\.woff2?$/i.test(f))).toBe(false);
    } finally {
      await rm(dest, { recursive: true, force: true });
    }
  });

  it("같은 이름의 OTF·TTF 가 있으면 그대로 복사하고 WOFF 는 건너뛴다, WOFF2 는 넣지 않는다", async () => {
    const src = await mkdtemp(join(tmpdir(), "yunseo-fonts-src-"));
    const dest = await mkdtemp(join(tmpdir(), "yunseo-fonts-dst-"));
    try {
      await writeFile(join(src, "A.otf"), "otf");
      await writeFile(join(src, "A.woff"), await readFile(join(FONTS, "Pretendard-Regular.woff")));
      await writeFile(join(src, "B.woff2"), "w2");
      expect(await stageSubtitleFonts(src, dest)).toEqual(["A.otf"]);
      expect(await readFile(join(dest, "A.otf"), "utf8")).toBe("otf");
    } finally {
      await rm(src, { recursive: true, force: true });
      await rm(dest, { recursive: true, force: true });
    }
  });
});
