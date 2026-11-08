// 보관함 — 만든 쇼츠(렌더 산출물 폴더)·카드뉴스 레퍼런스(docs/design/card-reference 수집분)를 읽는다.
// 파일 이름·경로는 정해진 모양만 받는다(경로 탈출 금지). 쓰기는 하지 않는다.
import { createReadStream, existsSync, readdirSync, readFileSync, statSync, type Stats } from "node:fs";
import { Readable } from "node:stream";
import { join, resolve, sep } from "node:path";
import { studio, studioWorkDir } from "./studio";

// ── 쇼츠 ────────────────────────────────────────────────
const PIECE_ID = /^[A-Z]-\d{6}-[a-z0-9]{4}$/;
const RENDER_ID = /^[a-f0-9]{6,64}$/;

export interface ReelVersion {
  renderId: string;
  /** ISO 시각(파일 수정 시각) */
  at: string;
  bytes: number;
  hasCover: boolean;
}
export interface ReelGroup {
  pieceId: string;
  title: string;
  versions: ReelVersion[];
}

const reelFile = (pieceId: string, renderId: string) => join(studioWorkDir(), pieceId, renderId, "reel", `${pieceId}-reel.mp4`);
const coverFile = (pieceId: string, renderId: string) => join(studioWorkDir(), pieceId, renderId, "cards", "01-cover.png");

const dirs = (p: string) => {
  try {
    return readdirSync(p, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
};

/** 원고별 릴스 — 최근 것이 위. 같은 원고의 이전 렌더도 버전으로 남긴다 */
export async function listReels(): Promise<ReelGroup[]> {
  const titles = new Map((await studio().listContent("all")).rows.map((r) => [r.piece.id, r.piece.title]));
  const groups: ReelGroup[] = [];
  for (const pieceId of dirs(studioWorkDir()).filter((d) => PIECE_ID.test(d))) {
    const versions: ReelVersion[] = [];
    for (const renderId of dirs(join(studioWorkDir(), pieceId)).filter((d) => RENDER_ID.test(d))) {
      const f = reelFile(pieceId, renderId);
      if (!existsSync(f)) continue;
      const st = statSync(f);
      versions.push({ renderId, at: st.mtime.toISOString(), bytes: st.size, hasCover: existsSync(coverFile(pieceId, renderId)) });
    }
    if (!versions.length) continue;
    versions.sort((a, b) => b.at.localeCompare(a.at));
    groups.push({ pieceId, title: titles.get(pieceId) ?? pieceId, versions });
  }
  return groups.sort((a, b) => b.versions[0]!.at.localeCompare(a.versions[0]!.at));
}

/** 영상·표지 파일 경로 — 모양이 틀리거나 없으면 null */
export function reelAsset(pieceId: string, renderId: string, kind: "video" | "cover"): string | null {
  if (!PIECE_ID.test(pieceId) || !RENDER_ID.test(renderId)) return null;
  const f = kind === "video" ? reelFile(pieceId, renderId) : coverFile(pieceId, renderId);
  return existsSync(f) ? f : null;
}

// ── 레퍼런스 ─────────────────────────────────────────────
// 카드뉴스 레퍼런스만 둔다 — 직접 캡처(docs/design/card-reference/capture)와 수집 목록(card-reference/refs.json, 그림은 외부 주소). 대시보드·UI 시안 수집분은 2026-11-07 에 지웠다.
export type RefSource = "instagram" | "pinterest";
export interface RefItem {
  id: string;
  set: string;
  source: RefSource;
  title: string;
  takeaway: string;
  tags: string[];
  /** 썸네일 — 외부 CDN 주소(저장하지 않음) 또는 /api/refs/… (저장소 안 캡처) */
  thumb: string;
  href: string;
}

/** docs/design 위치 — next start 는 apps/dashboard 에서, 테스트는 저장소 루트에서 돈다 */
function designDir(): string | null {
  for (const c of [resolve(process.cwd(), "docs/design"), resolve(process.cwd(), "../../docs/design")]) if (existsSync(c)) return c;
  return null;
}

let refCache: RefItem[] | null = null;

export function listReferences(): RefItem[] {
  if (refCache) return refCache;
  const dir = designDir();
  if (!dir) return [];
  const out: RefItem[] = [];
  const capDir = join(dir, "card-reference/capture");
  for (const f of existsSync(capDir) ? readdirSync(capDir).filter((n) => /^ref-\d{2}\.jpg$/.test(n)).sort() : []) {
    const n = f.slice(4, 6);
    out.push({ id: `card-${n}`, set: "카드뉴스 형태", source: "instagram", title: `dy1.mag 캐러셀 ${Number(n)}장`, takeaway: "질문 → 한 줄 답 → 근거 문단", tags: ["카드뉴스"], thumb: `/api/refs/card-reference/capture/${f}`, href: "https://www.instagram.com/p/DeqRl2llMaq/" });
  }
  out.push(...readRefsFile(join(dir, "card-reference/refs.json")));
  refCache = out;
  return refCache;
}

/** 수집 목록(docs/design/card-reference/refs.json) — 그림은 외부 주소(저장하지 않음). 모양이 틀린 줄은 건너뛴다. */
function readRefsFile(file: string): RefItem[] {
  if (!existsSync(file)) return [];
  let rows: unknown;
  try {
    rows = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return [];
  }
  if (!Array.isArray(rows)) return [];
  const out: RefItem[] = [];
  for (const r of rows as Record<string, unknown>[]) {
    const str = (k: string) => (typeof r[k] === "string" ? (r[k] as string) : "");
    const thumb = str("thumb");
    const href = str("href") || str("pin");
    if (!str("id") || !/^https:\/\//.test(thumb) || !/^https:\/\//.test(href)) continue;
    const source: RefSource = r.source === "instagram" ? "instagram" : "pinterest";
    const tags = Array.isArray(r.tags) ? r.tags.filter((t): t is string => typeof t === "string") : [];
    out.push({ id: str("id"), set: str("set") || "수집", source, title: str("title"), takeaway: str("takeaway"), tags, thumb, href });
  }
  return out;
}

/** 수집 목록 그림의 원본 주소 — 목록에 있고 i.pinimg.com 인 것만(그 밖은 null). /api/ref-image/<id> 가 이 주소를 받아 같은 출처로 내려준다 */
export function referenceImageUrl(id: string): string | null {
  const r = listReferences().find((x) => x.id === id);
  return r && /^https:\/\/i\.pinimg\.com\//.test(r.thumb) ? r.thumb : null;
}

/** 저장소 안 레퍼런스 그림 — docs/design 아래 jpg·png 만 */
export function referenceAsset(parts: string[]): string | null {
  const dir = designDir();
  if (!dir || !parts.length || parts.some((p) => !/^[a-z0-9-]+(\.(jpg|png))?$/i.test(p))) return null;
  const f = resolve(dir, ...parts);
  if (!f.startsWith(dir + sep) || !/\.(jpg|png)$/i.test(f) || !existsSync(f)) return null;
  return f;
}

// ── 파일 응답(영상은 구간 요청 지원 — 탐색·이어보기) ─────────────────
// 파일 전체를 메모리에 올리지 않는다 — stat 한 번으로 크기·ETag 를 알고, 본문은 읽기 스트림(구간 요청이면 그 구간만)으로 내보낸다.
// 같은 ETag 로 다시 물으면 304(본문 없음) — 영상 40MB 의 앞 1KB 를 읽는 데 전체를 읽던 비용(20ms)과 되풀이 전송이 사라진다.
const TYPES: Record<string, string> = { mp4: "video/mp4", png: "image/png", jpg: "image/jpeg", mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", ogg: "audio/ogg", flac: "audio/flac" };

export interface FileResponseOptions {
  download?: string;
  /** 기본 `private, max-age=300` — 내용이 바뀌지 않는 정적 파일은 더 길게 */
  cacheControl?: string;
}

/** 약한 ETag — 크기와 수정 시각(ms)이 같으면 같은 파일로 본다 */
const etagOf = (st: { size: number; mtimeMs: number }) => `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
const matches = (header: string | null, etag: string) => !!header && header.split(",").some((t) => t.trim() === etag || t.trim() === "*");

export function fileResponse(req: Request, path: string | null, opts: FileResponseOptions = {}): Response {
  if (!path) return new Response("not found", { status: 404 });
  let st: Stats;
  try {
    st = statSync(path);
  } catch {
    return new Response("not found", { status: 404 });
  }
  const size = st.size;
  const type = TYPES[path.slice(path.lastIndexOf(".") + 1).toLowerCase()] ?? "application/octet-stream";
  const etag = etagOf(st);
  const headers: Record<string, string> = { "content-type": type, "accept-ranges": "bytes", "cache-control": opts.cacheControl ?? "private, max-age=300", etag, "last-modified": st.mtime.toUTCString() };
  if (opts.download) headers["content-disposition"] = `attachment; filename="${opts.download}"`;
  if (matches(req.headers.get("if-none-match"), etag)) return new Response(null, { status: 304, headers: { "cache-control": headers["cache-control"]!, etag, "last-modified": headers["last-modified"]! } });
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  const body = (start: number, end: number) => Readable.toWeb(createReadStream(path, { start, end })) as unknown as ReadableStream<Uint8Array>;
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    return new Response(body(start, end), { status: 206, headers: { ...headers, "content-range": `bytes ${start}-${end}/${size}`, "content-length": String(end - start + 1) } });
  }
  if (size === 0) return new Response(new Uint8Array(0), { headers: { ...headers, "content-length": "0" } });
  return new Response(body(0, size - 1), { headers: { ...headers, "content-length": String(size) } });
}
