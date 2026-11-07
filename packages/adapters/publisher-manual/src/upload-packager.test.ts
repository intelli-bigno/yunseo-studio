import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32, inflateRawSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import type { CardRenderResult, ReelResult, RenderedFile } from "@yunseo/application";
import { createBundleFiles, createZipUploadPackager, type UploadManifest } from "./upload-packager";
import { writeZip } from "./zip";

/** 테스트용 zip 읽기 — 중앙 디렉터리를 따라 이름·내용을 꺼내고 CRC 를 확인한다 */
function readZip(buf: Buffer): Map<string, Buffer> {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = new Map<string, Buffer>();
  for (let i = 0; i < count; i++) {
    expect(buf.readUInt32LE(p)).toBe(0x02014b50);
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extra = buf.readUInt16LE(p + 30);
    const comment = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    const dataStart = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(dataStart, dataStart + size);
    const data = method === 8 ? inflateRawSync(raw) : Buffer.from(raw);
    expect(crc32(data) >>> 0, name).toBe(crc);
    out.set(name, data);
    p += 46 + nameLen + extra + comment;
  }
  return out;
}

const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "yunseo-pack-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function file(dir: string, name: string, content: string): RenderedFile {
  const path = join(dir, name);
  writeFileSync(path, content);
  const buf = readFileSync(path);
  return { name, path, bytes: buf.length, sha256: createHash("sha256").update(buf).digest("hex") };
}

function cardsIn(dir: string, n = 3): CardRenderResult {
  return {
    pieceId: "P-1",
    cards: Array.from({ length: n }, (_, i) => file(dir, `card-${i + 1}.png`, `\x89PNG fake ${i + 1}`)),
    caption: "캡션 첫 줄\n둘째 줄",
    hashtags: ["macro", "#rates"],
    altTexts: Array.from({ length: n }, (_, i) => `카드 ${i + 1} 설명`),
    warnings: ["글자 넘침 없음 확인 필요"],
  };
}

describe("업로드 묶음 zip", () => {
  it("카드 PNG·캡션·해시태그·대체 텍스트·manifest 를 담는다", async () => {
    const src = tmp();
    const out = tmp();
    const packager = createZipUploadPackager({ now: () => new Date("2026-11-05T01:00:00Z") });
    const bundle = await packager.bundle(cardsIn(src), null, out);
    expect(bundle.pieceId).toBe("P-1");
    const buf = readFileSync(bundle.zip.path);
    expect(bundle.zip).toMatchObject({ name: "P-1-upload.zip", bytes: buf.length, sha256: createHash("sha256").update(buf).digest("hex") });
    const files = readZip(buf);
    expect([...files.keys()]).toEqual(["cards/01.png", "cards/02.png", "cards/03.png", "caption.txt", "hashtags.txt", "alt-text.txt", "manifest.json"]);
    expect(files.get("cards/02.png")?.toString()).toBe("\x89PNG fake 2");
    expect(files.get("caption.txt")?.toString()).toBe("캡션 첫 줄\n둘째 줄\n");
    expect(files.get("hashtags.txt")?.toString()).toBe("#macro #rates\n");
    expect(files.get("alt-text.txt")?.toString()).toBe("01\t카드 1 설명\n02\t카드 2 설명\n03\t카드 3 설명\n");
    const manifest = JSON.parse(files.get("manifest.json")!.toString()) as UploadManifest;
    expect(manifest).toMatchObject({ schema: "upload-bundle/v1", pieceId: "P-1", createdAt: "2026-11-05T01:00:00.000Z", cards: 3, hasReel: false, warnings: ["글자 넘침 없음 확인 필요"] });
    expect(manifest.files.map((f) => [f.name, f.role])).toEqual([
      ["cards/01.png", "card"],
      ["cards/02.png", "card"],
      ["cards/03.png", "card"],
      ["caption.txt", "caption"],
      ["hashtags.txt", "hashtags"],
      ["alt-text.txt", "alt_text"],
    ]);
    for (const f of manifest.files) expect(createHash("sha256").update(files.get(f.name)!).digest("hex"), f.name).toBe(f.sha256);
  });

  it("릴스가 있으면 mp4 와 자막을 더한다", async () => {
    const src = tmp();
    const reel: ReelResult = { pieceId: "P-1", video: file(src, "reel.mp4", "fake mp4"), durationSec: 30, subtitles: file(src, "reel.srt", "1\n00:00:00,000 --> 00:00:01,000\n자막\n"), warnings: ["음성 없음"] };
    const bundle = await createZipUploadPackager().bundle(cardsIn(src, 1), reel, tmp());
    const files = readZip(readFileSync(bundle.zip.path));
    expect([...files.keys()]).toEqual(["cards/01.png", "caption.txt", "hashtags.txt", "alt-text.txt", "reel.mp4", "reel.srt", "manifest.json"]);
    const manifest = JSON.parse(files.get("manifest.json")!.toString()) as UploadManifest;
    expect(manifest.hasReel).toBe(true);
    expect(manifest.warnings).toContain("음성 없음");
  });

  it("렌더 기록과 실제 파일이 다르면 묶지 않는다", async () => {
    const src = tmp();
    const cards = cardsIn(src, 2);
    writeFileSync(cards.cards[1]!.path, "바뀐 파일 내용입니다");
    await expect(createZipUploadPackager().bundle(cards, null, tmp())).rejects.toThrow(/card-2\.png/);
    const same = cardsIn(src, 2);
    same.cards[0] = { ...same.cards[0]!, sha256: "0".repeat(64) };
    await expect(createZipUploadPackager().bundle(same, null, tmp())).rejects.toThrow(/sha256/);
  });

  it("카드 0장·대체 텍스트 수 불일치·다른 편 릴스는 거절", async () => {
    const src = tmp();
    const p = createZipUploadPackager();
    await expect(p.bundle({ ...cardsIn(src), cards: [], altTexts: [] }, null, tmp())).rejects.toThrow(/카드가 없음/);
    await expect(p.bundle({ ...cardsIn(src), altTexts: ["하나"] }, null, tmp())).rejects.toThrow(/대체 텍스트/);
    const reel: ReelResult = { pieceId: "P-2", video: file(src, "r.mp4", "x"), durationSec: 1, subtitles: null, warnings: [] };
    await expect(p.bundle(cardsIn(src), reel, tmp())).rejects.toThrow(/편 id 불일치/);
  });

  it("zip 항목 이름은 폴더 밖으로 나갈 수 없다", () => {
    expect(() => writeZip([{ name: "../x.txt", data: Buffer.from("a") }])).toThrow(/이름 오류/);
    expect(() => writeZip([{ name: "a.txt", data: Buffer.from("a") }, { name: "a.txt", data: Buffer.from("b") }])).toThrow(/중복/);
  });

  it("내려받기는 묶음 폴더 안의 zip 만 읽는다", async () => {
    const root = tmp();
    const bundle = await createZipUploadPackager().bundle(cardsIn(tmp()), null, join(root, "P-1"));
    const files = createBundleFiles(root);
    expect((await files.read(bundle.zip.path))?.byteLength).toBe(bundle.zip.bytes);
    expect(await files.read(join(tmp(), "other.zip"))).toBeNull();
    expect(await files.read(join(root, "P-1", "missing.zip"))).toBeNull();
  });

  it("has 는 read 와 같은 규칙으로 판정한다 — 작업 폴더 안의 실제 파일만 참", async () => {
    const root = tmp();
    const bundle = await createZipUploadPackager().bundle(cardsIn(tmp()), null, join(root, "P-1"));
    const files = createBundleFiles(root);
    expect(await files.has(bundle.zip.path)).toBe(true);
    expect(await files.has(join(root, "P-1", "missing.zip"))).toBe(false); // 없는 파일
    expect(await files.has(join(root, "P-1"))).toBe(false); // 폴더
    expect(await files.has(join(tmp(), "other.zip"))).toBe(false); // 작업 폴더 밖
    expect(await files.has("C:\\Users\\yjh99\\AppData\\Local\\Temp\\yunseo-studio-work\\P-1\\h\\cards\\01-cover.png")).toBe(false); // 옛 Windows 경로
  });
});
