// [L9] WOFF(1) → SFNT(OTF/TTF) 무손실 변환. libass(ffmpeg 자막 필터)는 WOFF 를 못 읽는다(Windows 실측: 「Error opening memory font Pretendard-*.woff」).
// WOFF1 은 SFNT 표마다 zlib 압축만 씌운 것이라 표를 풀어 SFNT 로 다시 쌓으면 원본과 같은 글꼴이 된다(서체 자체는 고치지 않는다 — OFL 그대로).
import { inflateSync } from "node:zlib";

export class WoffError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WoffError";
  }
}

/** WOFF1 파일인가(서명 wOFF) */
export const isWoff1 = (b: Uint8Array): boolean => b.length >= 44 && b[0] === 0x77 && b[1] === 0x4f && b[2] === 0x46 && b[3] === 0x46;

/** SFNT 종류에 맞는 확장자 — CFF 윤곽(OTTO)은 .otf, 그 밖(0x00010000·true)은 .ttf */
export function sfntExtension(sfnt: Uint8Array): ".otf" | ".ttf" {
  return sfnt[0] === 0x4f && sfnt[1] === 0x54 && sfnt[2] === 0x54 && sfnt[3] === 0x4f ? ".otf" : ".ttf";
}

/** WOFF1 → SFNT. 형식이 깨졌으면 WoffError */
export function woffToSfnt(input: Uint8Array): Uint8Array {
  if (!isWoff1(input)) throw new WoffError("WOFF1 서명(wOFF)이 아니다");
  const src = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  const flavor = src.readUInt32BE(4);
  const numTables = src.readUInt16BE(12);
  if (numTables === 0 || 44 + numTables * 20 > src.length) throw new WoffError("표 목록이 파일 밖으로 나간다");

  const tables: { tag: number; checksum: number; data: Buffer }[] = [];
  for (let i = 0; i < numTables; i += 1) {
    const at = 44 + i * 20;
    const tag = src.readUInt32BE(at);
    const offset = src.readUInt32BE(at + 4);
    const compLength = src.readUInt32BE(at + 8);
    const origLength = src.readUInt32BE(at + 12);
    const checksum = src.readUInt32BE(at + 16);
    if (offset + compLength > src.length) throw new WoffError(`표 ${i} 가 파일 밖으로 나간다`);
    const raw = src.subarray(offset, offset + compLength);
    const data = compLength < origLength ? inflateSync(raw) : Buffer.from(raw);
    if (data.length !== origLength) throw new WoffError(`표 ${i} 길이 불일치(${data.length} ≠ ${origLength})`);
    tables.push({ tag, checksum, data });
  }

  // SFNT 머리 — searchRange 등은 표 수에서 계산한다(OpenType 명세)
  let pow = 1;
  let log = 0;
  while (pow * 2 <= numTables) {
    pow *= 2;
    log += 1;
  }
  const pad4 = (n: number) => (n + 3) & ~3;
  const headerSize = 12 + numTables * 16;
  const total = tables.reduce((n, t) => n + pad4(t.data.length), headerSize);
  const out = Buffer.alloc(total);
  out.writeUInt32BE(flavor, 0);
  out.writeUInt16BE(numTables, 4);
  out.writeUInt16BE(pow * 16, 6);
  out.writeUInt16BE(log, 8);
  out.writeUInt16BE(numTables * 16 - pow * 16, 10);
  let offset = headerSize;
  tables.forEach((t, i) => {
    const rec = 12 + i * 16;
    out.writeUInt32BE(t.tag, rec);
    out.writeUInt32BE(t.checksum, rec + 4);
    out.writeUInt32BE(offset, rec + 8);
    out.writeUInt32BE(t.data.length, rec + 12);
    t.data.copy(out, offset);
    offset += pad4(t.data.length);
  });
  return new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
}
