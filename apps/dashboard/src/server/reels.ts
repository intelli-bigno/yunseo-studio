// [W3 릴스] 릴스 편집기 조립 — 프로젝트 저장소(reels_projects)와 편집 소스(만든 쇼츠 영상·렌더 카드 그림) 목록.
// 저장 파일은 원고 저장소와 같은 STUDIO_DB(없으면 메모리). 쓰기 전 모양 검사는 lib/reels-timeline 이 한다.
import { randomBytes } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { overlaps, projectIssues, type ReelsProject, type ReelsSource } from "@/lib/reels-timeline";
import { toProjectV1, type ReelsProjectV2 } from "@yunseo/domain";
import { listReels } from "./library";
import { reelsStore, reelsTimelineTools, studioWorkDir } from "./studio";

export { reelsStore, ReelsRevisionConflictError } from "./studio";

/** R-<12자 무작위> */
export const newReelsProjectId = () => `R-${randomBytes(6).toString("hex")}`;
const PROJECT_ID = /^R-[a-f0-9]{12}$/;
export const isReelsProjectId = (id: string) => PROJECT_ID.test(id);

/** 저장 가능한 프로젝트인지 — 문제 목록(비면 통과) */
export function reelsProjectProblems(v: unknown): string[] {
  const issues = projectIssues(v);
  return issues.length ? issues : overlaps(v as ReelsProject);
}

/**
 * v1 편집기(통째 PUT)용 판. 저장값이 v2(ops 로 고친 판)면 v1 로 투영한다.
 * lossless=false 면 v1 로 담을 수 없는 v2 편집이 있어 이 판으로 PUT 하면 409(LOSSY_OVERWRITE) — ops 로만 고친다.
 */
export function loadReelsProject(id: string): { project: ReelsProject; revision: number; updatedAt: string; lossless: boolean } | null {
  const r = isReelsProjectId(id) ? reelsStore().get(id) : null;
  if (!r) return null;
  const raw = JSON.parse(r.data) as { version?: unknown };
  if (raw.version !== 2) return { project: raw as ReelsProject, revision: r.revision, updatedAt: r.updatedAt, lossless: true };
  const v1 = toProjectV1(raw as ReelsProjectV2);
  return { project: v1.project as ReelsProject, revision: r.revision, updatedAt: r.updatedAt, lossless: v1.lossless };
}

// ── 소스 ────────────────────────────────────────────────
const PIECE_ID = /^[A-Z]-\d{6}-[a-z0-9]{4}$/;
const RENDER_ID = /^[a-f0-9]{6,64}$/;
const CARD_FILE = /^\d{2}-[a-z0-9-]+\.png$/;
const cardsDir = (pieceId: string, renderId: string) => join(studioWorkDir(), pieceId, renderId, "cards");

/** 렌더 카드 그림 경로 — 모양이 틀리거나 없으면 null */
export function reelsCardAsset(pieceId: string, renderId: string, file: string): string | null {
  if (!PIECE_ID.test(pieceId) || !RENDER_ID.test(renderId) || !CARD_FILE.test(file)) return null;
  const f = join(cardsDir(pieceId, renderId), file);
  return existsSync(f) ? f : null;
}

// ── 오디오 전용 자산(BGM·내레이션) — 저장소 assets/audio/<종류>/<파일> ─────────
export const REELS_AUDIO_KINDS = { bgm: "BGM", narration: "내레이션" } as const;
export type ReelsAudioKind = keyof typeof REELS_AUDIO_KINDS;
const AUDIO_FILE = /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,63}\.(mp3|wav|m4a|ogg|flac)$/i;
const isAudioKind = (k: string): k is ReelsAudioKind => Object.hasOwn(REELS_AUDIO_KINDS, k);
const audioDir = (kind: ReelsAudioKind) => {
  const root = reelsTimelineTools().assetsDir;
  return root ? join(root, "audio", kind) : null;
};

/** 오디오 자산 경로 — 원본 id 는 audio/<bgm|narration>/<파일>. 모양이 틀리거나 없으면 null */
export function reelsAudioAsset(kind: string, file: string): string | null {
  if (!isAudioKind(kind) || !AUDIO_FILE.test(file) || file.includes("..")) return null;
  const dir = audioDir(kind);
  const f = dir ? join(dir, file) : null;
  return f && existsSync(f) ? f : null;
}

function listAudioSources(): ReelsSource[] {
  const out: ReelsSource[] = [];
  for (const kind of Object.keys(REELS_AUDIO_KINDS) as ReelsAudioKind[]) {
    const dir = audioDir(kind);
    let files: string[];
    try {
      files = dir ? readdirSync(dir).filter((f) => AUDIO_FILE.test(f) && !f.includes("..")).sort() : [];
    } catch {
      files = [];
    }
    for (const f of files) out.push({ id: `audio/${kind}/${f}`, kind: "audio", label: `${REELS_AUDIO_KINDS[kind]} · ${f.replace(/\.[^.]+$/, "")}`, src: `/api/reels/audio/${kind}/${f}` });
  }
  return out;
}

/** 편집 소스 — 원고마다 최근 렌더의 쇼츠 영상 1개 + 카드 그림들 + 오디오 자산(BGM·내레이션) */
export async function listReelsSources(): Promise<ReelsSource[]> {
  const out: ReelsSource[] = [];
  for (const g of await listReels()) {
    const v = g.versions[0]!;
    const base = `/api/reels/${g.pieceId}/${v.renderId}`;
    out.push({ id: `${g.pieceId}/${v.renderId}/video`, kind: "video", label: `${g.title} · 쇼츠`, src: `${base}/video`, ...(v.hasCover ? { poster: `${base}/cover` } : {}) });
    let files: string[];
    try {
      files = readdirSync(cardsDir(g.pieceId, v.renderId)).filter((f) => CARD_FILE.test(f)).sort();
    } catch {
      files = [];
    }
    for (const f of files) out.push({ id: `${g.pieceId}/${v.renderId}/${f}`, kind: "image", label: `${g.title} · ${f.slice(0, 2)}`, src: `/api/reels/assets/${g.pieceId}/${v.renderId}/${f}` });
  }
  out.push(...listAudioSources());
  return out;
}
