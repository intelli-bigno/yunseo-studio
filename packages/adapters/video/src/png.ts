// PNG 머리글만 읽는다 — 카드 크기·형식 점검용 (외부 라이브러리 없음).
const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export interface PngSize {
  width: number;
  height: number;
}

/** PNG 가 아니거나 머리글이 짧으면 null */
export function readPngSize(bytes: Uint8Array): PngSize | null {
  if (bytes.length < 24) return null;
  if (!SIGNATURE.every((b, i) => bytes[i] === b)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(12) !== 0x49484452) return null; // 첫 청크는 IHDR
  return { width: view.getUint32(16), height: view.getUint32(20) };
}
