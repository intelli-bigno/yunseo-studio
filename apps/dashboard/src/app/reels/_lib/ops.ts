// [릴스 편집기] 편집 명령 전송 — 모든 편집은 POST /api/reels/:id/ops 로만 보낸다(사람 화면과 AI 가 같은 명령). 문서: docs/12-reels-ops-schema.md §2·§3.
// 여기에는 fetch 한 겹과, UI 동작 → op 로 바꾸는 작은 순수 함수만 둔다.
import { clipLen } from "./timeline";
import type { Clip, Op, OpFailure, OpRequest, OpSuccess } from "./types";

export type OpResult = { ok: true; res: OpSuccess } | { ok: false; status: number; error: OpFailure["error"]; revision?: number };

export const uid = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
/** 이 화면 한 번의 접속을 가리키는 이름 — op 로그의 「누가 고쳤나」 */
export const newClientId = () => `editor-${crypto.randomUUID().slice(0, 4)}`;

export async function postOp(projectId: string, req: OpRequest, signal?: AbortSignal | null): Promise<OpResult> {
  let r: Response;
  try {
    r = await fetch(`/api/reels/${encodeURIComponent(projectId)}/ops`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(req), signal: signal ?? null });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    return { ok: false, status: 0, error: { code: "NETWORK", message: "연결을 확인" } };
  }
  const body = (await r.json().catch(() => null)) as (Partial<OpSuccess> & Partial<OpFailure>) | null;
  if (r.ok && body && typeof body.revision === "number") return { ok: true, res: body as OpSuccess };
  const error = body?.error ?? { code: "BAD_RESPONSE", message: `응답 ${r.status}` };
  return { ok: false, status: r.status, error, ...(typeof body?.revision === "number" ? { revision: body.revision } : {}) };
}

const TEXT: Record<string, string> = {
  REVISION_CONFLICT: "다른 곳에서 먼저 고쳤다 — 새로 불러왔다",
  NOTHING_TO_UNDO: "되돌릴 것이 없다",
  NOTHING_TO_REDO: "다시 할 것이 없다",
  CLIP_OVERLAP: "같은 트랙의 클립과 겹친다",
  OUT_OF_RANGE: "시간·원본 범위를 벗어난다",
  SPLIT_AT_EDGE: "가장자리에서는 자를 수 없다",
  TRACK_LOCKED: "잠긴 트랙이다",
  TRACK_KIND_MISMATCH: "이 트랙에는 놓을 수 없다",
  SRT_PARSE_ERROR: "자막 파일을 읽지 못했다",
  SOURCE_NOT_FOUND: "자산을 찾지 못했다",
  TOO_LARGE: "요청이 너무 크다",
  NETWORK: "연결을 확인",
};

/** 화면에 띄울 한 줄 — 알려진 코드는 짧은 한글, 나머지는 서버 메시지 */
export function errorText(code: string, message: string): string {
  return TEXT[code] ?? `${code}${message ? ` · ${message}` : ""}`;
}

// ── UI 동작 → op ──
/** 재생 위치에서 자르기 — 한 개면 split, 여럿이면 batch(되돌리기 한 번에) */
export function splitOps(clips: Clip[], at: number): Op | null {
  const ops = clips.map((c): Op => ({ op: "split", clipId: c.id, at, newId: uid("c") }));
  if (ops.length === 0) return null;
  return ops.length === 1 ? ops[0]! : { op: "batch", label: "자르기", ops };
}

/** 줌 — 클립 처음·끝의 배율 두 개(키프레임). 이미 있는 같은 시각 값은 서버가 교체한다 */
export function zoomOp(clip: Clip, from: number, to: number, easeKind: "linear" | "ease-in-out"): Op {
  return {
    op: "batch",
    label: "줌",
    ops: [
      { op: "add_keyframe", clipId: clip.id, prop: "scale", at: 0, value: from, ease: easeKind },
      { op: "add_keyframe", clipId: clip.id, prop: "scale", at: clipLen(clip), value: to, ease: easeKind },
    ],
  };
}
