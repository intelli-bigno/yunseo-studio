// 유스케이스·어댑터의 실패 값을 API 가 던질 AppError 로 바꾸는 곳 — 라우트는 여기 함수만 부르고 응답 모양을 따로 만들지 않는다(server/api.ts 가 응답으로 바꾼다).
import type { CardDeckSave } from "@yunseo/application";
import { AppError, errorMessage, isAppError } from "@yunseo/domain";

/** 덱 저장 실패(유스케이스의 ok:false) → 오류. 400 은 검증 문제 목록을 details.errors 에 싣는다 */
export function deckSaveFailure(r: Extract<CardDeckSave, { ok: false }>): AppError {
  if (r.status === 400) return new AppError("INVALID_DECK", `덱이 규칙에 어긋난다${r.errors.length ? ` — ${r.errors.slice(0, 3).join(", ")}` : ""}`, { status: 400, details: { errors: r.errors } });
  if (r.status === 404) return new AppError("DECK_NOT_FOUND", "덱이 없다", { status: 404 });
  return new AppError("REVISION_CONFLICT", "다른 곳에서 먼저 저장했다", { status: 409, details: r.revision !== undefined ? { revision: r.revision } : undefined });
}

/**
 * 내보내기(ffmpeg 합성) 중 던져진 값 → 오류. 타입 있는 오류(FFMPEG_*·REEL_RULE_VIOLATION·SOURCE_NOT_FOUND 등)는 그대로 두고,
 * 그 밖은 RENDER_FAILED 로 감싼다 — 메시지는 그대로 보여 준다(운영자 전용 화면이라 ffmpeg 가 남긴 이유가 곧 해결 단서).
 */
export function renderFailure(e: unknown): AppError {
  return isAppError(e) ? e : new AppError("RENDER_FAILED", errorMessage(e), { cause: e });
}

/** 릴스 프로젝트 모양이 틀렸다(문제 목록) → 400 */
export function invalidProject(problems: string[]): AppError {
  return new AppError("INVALID_PROJECT", "프로젝트 모양이 틀렸다", { status: 400, details: { problems } });
}

/** ops 유스케이스의 실패 응답({status, body:{error, revision?}}) → 오류. 최신 revision 은 details.revision 으로 이어 준다 */
export function opsFailure(r: { status: number; body: Record<string, unknown> }): AppError {
  const err = (r.body.error ?? {}) as { code?: string; message?: string; path?: string; details?: Record<string, unknown> };
  const details = { ...err.details, ...(typeof r.body.revision === "number" ? { revision: r.body.revision } : {}) };
  return new AppError(err.code ?? "SAVE_FAILED", err.message ?? "저장하지 못했다", { status: r.status, path: err.path, details: Object.keys(details).length ? details : undefined });
}
