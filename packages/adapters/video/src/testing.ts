// 테스트 보조 — 카드 PNG 픽스처 만들기, 영상에서 프레임 한 장 꺼내 픽셀 검사. 외부 라이브러리 없이 Node 내장만 쓴다.
// index.ts 에서 내보내지 않는다(테스트만 쓴다).
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { crc32, deflateSync } from "node:zlib";
import type { CardRenderResult, RenderedFile } from "@yunseo/application";

const run = promisify(execFile);

function chunk(type: string, data: Uint8Array): Buffer {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}

/** 한 색으로 채운 RGB PNG */
export function solidPng(width: number, height: number, rgb: readonly [number, number, number]): Buffer {
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) {
    row[1 + x * 3] = rgb[0];
    row[2 + x * 3] = rgb[1];
    row[3 + x * 3] = rgb[2];
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8비트 · RGB · 기본 압축/필터/비인터레이스
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(Array.from({ length: height }, () => row)))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** 어두운 단색 카드 N장을 만들어 CardRenderResult 로 돌려준다 (글자가 없어 자막만 밝다) */
export async function writeCardFixtures(dir: string, colors: ReadonlyArray<readonly [number, number, number]>, altTexts: readonly string[], size = { width: 1080, height: 1350 }): Promise<CardRenderResult> {
  await mkdir(dir, { recursive: true });
  const cards: RenderedFile[] = [];
  for (const [i, color] of colors.entries()) {
    const bytes = solidPng(size.width, size.height, color);
    const name = `card-${i + 1}.png`;
    const path = join(dir, name);
    await writeFile(path, bytes);
    cards.push({ name, path, bytes: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex") });
  }
  return { pieceId: "fixture-piece", cards, caption: "fixture", hashtags: [], altTexts: [...altTexts], warnings: [] };
}

export interface Frame {
  width: number;
  height: number;
  /** rgb24 */
  data: Buffer;
}

/** 영상의 atSec 시점 프레임 한 장을 rgb24 로 꺼낸다 */
export async function grabFrame(ffmpegPath: string, video: string, atSec: number, width = 1080, height = 1920): Promise<Frame> {
  const { stdout } = await run(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-ss", String(atSec), "-i", video, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], {
    encoding: "buffer",
    maxBuffer: width * height * 3 + 1024,
  });
  if (stdout.length !== width * height * 3) throw new Error(`프레임 크기가 이상하다: ${stdout.length} != ${width * height * 3} (atSec=${atSec})`);
  return { width, height, data: stdout };
}

export const pixelAt = (f: Frame, x: number, y: number): [number, number, number] => {
  const i = (y * f.width + x) * 3;
  return [f.data[i]!, f.data[i + 1]!, f.data[i + 2]!];
};

const luma = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** 밝은 픽셀(자막 글자)의 개수와 경계 상자. 없으면 null */
export function brightBounds(f: Frame, threshold = 200): { count: number; x: number; y: number; w: number; h: number } | null {
  let minX = f.width, minY = f.height, maxX = -1, maxY = -1, count = 0;
  for (let y = 0; y < f.height; y++) {
    for (let x = 0; x < f.width; x++) {
      const i = (y * f.width + x) * 3;
      if (luma(f.data[i]!, f.data[i + 1]!, f.data[i + 2]!) <= threshold) continue;
      count++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return count === 0 ? null : { count, x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** 음성·음악 슬롯 시험용 사인파 WAV 를 ffmpeg 로 만든다 */
export async function writeTone(ffmpegPath: string, path: string, seconds: number, hz = 440): Promise<void> {
  await run(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", `sine=frequency=${hz}:duration=${seconds}`, path]);
}
