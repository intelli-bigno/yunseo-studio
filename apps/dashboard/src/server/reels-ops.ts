// [W5 릴스] 편집 명령(ops)·타임라인 렌더 조립 — 원본 id → 파일 경로·길이(ffprobe, 캐시), 등록 LUT·그림(assets/), 음성 구간(silencedetect).
// 라우트(app/api/reels/[pieceId]/ops·export)는 여기 함수만 부른다. 어댑터는 studio.ts 를 거쳐서만 쓴다(04 규칙 4).
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createReelsOpsUseCases, type ReelsOpsUseCases } from "@yunseo/application";
import { AppError, toProjectV2, type OpContext, type SourceInfo } from "@yunseo/domain";
import { reelAsset } from "./library";
import { isReelsProjectId, reelsAudioAsset, reelsCardAsset } from "./reels";
import { reelsOpsStore, reelsTimelineTools, studioWorkDir } from "./studio";

interface MediaInfo { path: string; kind: "video" | "image" | "audio"; durationMs?: number; hasAudio: boolean }
const probeCache = new Map<string, { durationMs?: number; hasAudio: boolean }>();

/** 원본 id(<원고>/<렌더>/video | <원고>/<렌더>/<NN-카드>.png | audio/<bgm|narration>/<파일>) → 파일 */
function resolvePath(sourceId: string): { path: string; kind: MediaInfo["kind"] } | null {
  const [pieceId, renderId, rest, ...more] = sourceId.split("/");
  if (!pieceId || !renderId || !rest || more.length) return null;
  if (pieceId === "audio") {
    const path = reelsAudioAsset(renderId, rest);
    return path ? { path, kind: "audio" } : null;
  }
  if (rest === "video") {
    const path = reelAsset(pieceId, renderId, "video");
    return path ? { path, kind: "video" } : null;
  }
  const path = reelsCardAsset(pieceId, renderId, rest);
  return path ? { path, kind: "image" } : null;
}

async function media(sourceId: string): Promise<MediaInfo | null> {
  const r = resolvePath(sourceId);
  if (!r) return null;
  if (r.kind === "image") return { ...r, hasAudio: false };
  let info = probeCache.get(r.path);
  if (!info) {
    const p = await reelsTimelineTools().probe(r.path);
    const sec = (r.kind === "audio" ? null : p.video?.durationSec) ?? p.formatDurationSec; // 오디오 파일은 컨테이너 길이
    info = { ...(sec ? { durationMs: Math.round(sec * 1000) } : {}), hasAudio: p.audio !== null };
    probeCache.set(r.path, info);
  }
  return { ...r, ...info };
}

/** op 안에 나온 원본 id 전부(batch 포함) */
function sourceIdsIn(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) v.forEach((x) => sourceIdsIn(x, out));
  else if (v && typeof v === "object")
    for (const [k, x] of Object.entries(v)) {
      if (k === "sourceId" && typeof x === "string") out.add(x);
      else sourceIdsIn(x, out);
    }
  return out;
}

const assetsDir = () => reelsTimelineTools().assetsDir;
const ASSET_ID = /^[A-Za-z0-9_-]{1,64}$/;
/** §7 기본안 — 저장소 assets/luts/*.cube, id = 파일 이름 */
export function reelsLuts(): string[] {
  const dir = assetsDir();
  if (!dir || !existsSync(join(dir, "luts"))) return [];
  return readdirSync(join(dir, "luts")).filter((f) => f.endsWith(".cube")).map((f) => f.slice(0, -5)).filter((id) => ASSET_ID.test(id));
}
const lutPath = (id: string) => (ASSET_ID.test(id) && assetsDir() && existsSync(join(assetsDir()!, "luts", `${id}.cube`)) ? join(assetsDir()!, "luts", `${id}.cube`) : undefined);
const assetPath = (id: string) => (ASSET_ID.test(id) && assetsDir() && existsSync(join(assetsDir()!, `${id}.png`)) ? join(assetsDir()!, `${id}.png`) : undefined);

const slot = globalThis as typeof globalThis & { __yunseoReelsOpsUc?: ReelsOpsUseCases };

export function reelsOps(): ReelsOpsUseCases {
  return (slot.__yunseoReelsOpsUc ??= createReelsOpsUseCases({
    repo: reelsOpsStore(),
    async context(op): Promise<Omit<OpContext, "speech">> {
      const known = new Map<string, SourceInfo>();
      for (const id of sourceIdsIn(op)) {
        const m = await media(id).catch(() => null);
        if (m) known.set(id, { kind: m.kind, ...(m.durationMs !== undefined ? { durationMs: m.durationMs } : {}) });
      }
      return { sources: (id) => known.get(id), luts: reelsLuts() };
    },
    async measureSpeech(project, clipId, silence) {
      const c = project.clips.find((x) => x.id === clipId);
      if (!c?.sourceId) return undefined;
      const m = await media(c.sourceId);
      if (!m?.hasAudio || m.durationMs === undefined) return undefined;
      return reelsTimelineTools().detectSpeech(m.path, silence, m.durationMs);
    },
  }));
}

/** 내보낸 판의 폴더 — STUDIO_WORK_DIR/reels-projects/<id>/r<revision>/ (exportReelsProject 가 쓰고, 받기 라우트가 읽는다) */
const exportDir = (id: string, revision: number) => join(studioWorkDir(), "reels-projects", id, `r${revision}`);

/** 내보낸 mp4·srt 파일 경로 — 프로젝트 id·판 번호 모양이 틀리거나 파일이 없으면 null */
export function exportedReelFile(id: string, revision: string, kind: "video" | "srt"): string | null {
  if (!isReelsProjectId(id) || !/^\d{1,9}$/.test(revision)) return null;
  const file = join(exportDir(id, Number(revision)), `${id}.${kind === "video" ? "mp4" : "srt"}`);
  return existsSync(file) ? file : null;
}

/** 프로젝트 지금 판을 1080x1920 MP4 로 — STUDIO_WORK_DIR/reels-projects/<id>/r<revision>/ */
export async function exportReelsProject(id: string) {
  if (!isReelsProjectId(id)) return null;
  const rec = reelsOpsStore().get(id);
  if (!rec) return null;
  const project = toProjectV2(JSON.parse(rec.data));
  const resolved = new Map<string, MediaInfo>();
  for (const c of project.clips) {
    const sid = c.sourceId ?? (c.component?.type === "card" ? c.component.sourceId : undefined);
    if (sid && !resolved.has(sid)) {
      const m = await media(sid);
      if (m) resolved.set(sid, m);
    }
  }
  const missing = project.clips.filter((c) => c.sourceId && !resolved.has(c.sourceId)).map((c) => c.id);
  if (missing.length) throw new AppError("SOURCE_NOT_FOUND", `원본 파일이 없는 클립: ${missing.join(", ")}`, { status: 422, details: { clipIds: missing } });
  const outDir = exportDir(id, rec.revision);
  const out = await reelsTimelineTools().compose({
    project,
    media: (sid) => resolved.get(sid),
    asset: assetPath,
    lut: lutPath,
    outDir,
    name: id,
  });
  return { revision: rec.revision, video: out.videoPath, srt: out.srtPath, durationMs: out.durationMs, probe: out.probe, warnings: out.warnings };
}
