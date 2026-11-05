// [L2] UploadPackager(계약) 구현 — 수동 업로드 묶음 zip: 카드 PNG + caption.txt + hashtags.txt + alt-text.txt + (있으면) 릴스 mp4·자막 + manifest.json.
// 게시하지 않는다(D2: MVP 는 수동 업로드). 렌더 결과에 적힌 크기·sha256 과 실제 파일이 다르면 묶지 않는다(낡거나 바뀐 파일 차단).
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { BundleFiles, CardRenderResult, ReelResult, RenderedFile, UploadBundle, UploadPackager } from "@yunseo/application";
import { writeZip, type ZipEntry } from "./zip";

export const MANIFEST_SCHEMA = "upload-bundle/v1";

export interface ManifestFile {
  name: string;
  bytes: number;
  sha256: string;
  role: "card" | "caption" | "hashtags" | "alt_text" | "reel" | "subtitles";
}

export interface UploadManifest {
  schema: typeof MANIFEST_SCHEMA;
  pieceId: string;
  createdAt: string;
  cards: number;
  hasReel: boolean;
  /** 렌더·릴스 단계 경고(사람이 읽고 판정) */
  warnings: string[];
  files: ManifestFile[];
}

export interface ZipUploadPackagerOptions {
  now?: () => Date;
}

const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const text = (s: string) => Buffer.from(s.endsWith("\n") ? s : `${s}\n`, "utf8");
const pad = (n: number) => String(n).padStart(2, "0");
/** 파일 이름에 쓸 수 없는 글자를 걷어낸다 */
const safe = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "piece";

async function readChecked(f: RenderedFile): Promise<Buffer> {
  const data = await readFile(f.path);
  if (data.length !== f.bytes) throw new Error(`${f.name}: 크기가 렌더 기록과 다름(${data.length} ≠ ${f.bytes})`);
  if (sha256(data) !== f.sha256) throw new Error(`${f.name}: sha256 이 렌더 기록과 다름`);
  return data;
}

export class ZipUploadPackager implements UploadPackager {
  readonly #now: () => Date;

  constructor(options: ZipUploadPackagerOptions = {}) {
    this.#now = options.now ?? (() => new Date());
  }

  async bundle(cards: CardRenderResult, reel: ReelResult | null, outDir: string): Promise<UploadBundle> {
    if (cards.cards.length === 0) throw new Error("묶을 카드가 없음");
    if (cards.altTexts.length !== cards.cards.length) throw new Error("대체 텍스트 수가 카드 수와 다름");
    if (reel && reel.pieceId !== cards.pieceId) throw new Error(`릴스 편 id 불일치: ${reel.pieceId} ≠ ${cards.pieceId}`);
    const now = this.#now();
    const entries: (ZipEntry & { role: ManifestFile["role"] })[] = [];
    for (const [i, f] of cards.cards.entries()) entries.push({ name: `cards/${pad(i + 1)}.png`, data: await readChecked(f), role: "card" });
    entries.push({ name: "caption.txt", data: text(cards.caption), role: "caption" });
    entries.push({ name: "hashtags.txt", data: text(cards.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")), role: "hashtags" });
    entries.push({ name: "alt-text.txt", data: text(cards.altTexts.map((a, i) => `${pad(i + 1)}\t${a.replace(/\s+/g, " ").trim()}`).join("\n")), role: "alt_text" });
    if (reel) {
      entries.push({ name: "reel.mp4", data: await readChecked(reel.video), role: "reel" });
      if (reel.subtitles) entries.push({ name: `reel${/\.[a-z0-9]+$/i.exec(reel.subtitles.name)?.[0] ?? ".srt"}`, data: await readChecked(reel.subtitles), role: "subtitles" });
    }
    const manifest: UploadManifest = {
      schema: MANIFEST_SCHEMA,
      pieceId: cards.pieceId,
      createdAt: now.toISOString(),
      cards: cards.cards.length,
      hasReel: !!reel,
      warnings: [...cards.warnings, ...(reel?.warnings ?? [])],
      files: entries.map((e) => ({ name: e.name, bytes: e.data.byteLength, sha256: sha256(e.data), role: e.role })),
    };
    const zip = writeZip([...entries, { name: "manifest.json", data: text(JSON.stringify(manifest, null, 2)) }], now);
    await mkdir(outDir, { recursive: true });
    const name = `${safe(cards.pieceId)}-upload.zip`;
    const path = join(outDir, name);
    await writeFile(path, zip);
    return { pieceId: cards.pieceId, zip: { name, path, bytes: zip.length, sha256: sha256(zip) } };
  }
}

export function createZipUploadPackager(options: ZipUploadPackagerOptions = {}): ZipUploadPackager {
  return new ZipUploadPackager(options);
}

/** 산출물 읽기(묶음 zip 내려받기·렌더 카드 미리보기) — 작업 폴더 밖·다른 확장자는 읽지 않는다(경로는 저장소 기록에서 오지만 한 겹 더 막는다) */
export function createBundleFiles(root: string): BundleFiles {
  const base = join(root, "/");
  return {
    async read(path: string): Promise<Uint8Array | null> {
      const full = join(path);
      if (!full.startsWith(base) || !/\.(zip|png|mp4|srt|vtt)$/i.test(basename(full))) return null;
      try {
        return await readFile(full);
      } catch {
        return null;
      }
    },
  };
}
