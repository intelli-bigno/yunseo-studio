// 최소 ZIP 쓰기(PKWARE APPNOTE 6.3 — 로컬 헤더 + 중앙 디렉터리, ZIP64 없음). 외부 패키지 없이 node:zlib 만 쓴다.
// 이미 압축된 파일(PNG·MP4)은 저장(method 0), 글자 파일은 deflate(method 8). 파일 이름은 UTF-8(플래그 비트 11).
import { crc32, deflateRawSync } from "node:zlib";

export interface ZipEntry {
  name: string;
  data: Uint8Array;
  /** 기본: 글자 파일만 압축 */
  compress?: boolean;
}

const MAX = 0xffffffff;

/** DOS 날짜·시각(로컬 헤더 표기). 같은 입력이면 같은 zip 이 나오게 고정 시각을 받는다 */
function dosTime(d: Date): { time: number; date: number } {
  const year = Math.max(1980, d.getUTCFullYear());
  return {
    time: (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | Math.floor(d.getUTCSeconds() / 2),
    date: ((year - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate(),
  };
}

export function writeZip(entries: readonly ZipEntry[], modified: Date = new Date(Date.UTC(2026, 0, 1))): Buffer {
  const names = new Set<string>();
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  const { time, date } = dosTime(modified);
  let offset = 0;
  for (const e of entries) {
    if (!e.name || e.name.startsWith("/") || e.name.includes("..") || e.name.includes("\\")) throw new Error(`zip 항목 이름 오류: ${e.name}`);
    if (names.has(e.name)) throw new Error(`zip 항목 이름 중복: ${e.name}`);
    names.add(e.name);
    const name = Buffer.from(e.name, "utf8");
    const raw = Buffer.from(e.data.buffer, e.data.byteOffset, e.data.byteLength);
    const deflate = e.compress ?? /\.(txt|json|srt|vtt)$/i.test(e.name);
    const body = deflate ? deflateRawSync(raw) : raw;
    const crc = crc32(raw) >>> 0;
    if (raw.length >= MAX || body.length >= MAX || offset >= MAX) throw new Error("zip 이 4GB 를 넘음(ZIP64 미지원)");

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // 필요한 버전 2.0
    local.writeUInt16LE(0x0800, 6); // UTF-8 이름
    local.writeUInt16LE(deflate ? 8 : 0, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(deflate ? 8 : 0, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + body.length;
  }
  const dir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}
