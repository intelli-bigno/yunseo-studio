// 원고 초안 포트 — 04 포트 표의 ScriptDrafter. 구현은 선택이고 기본은 꺼져 있다(D4: 유료 호출 없이 사람이 쓴다).
// 초안은 항상 `assistant` 가 쓴 것으로 표시되고(02 §2 단계 3), 금지 표현 block 이 있으면 돌려주지 않는다.
// 초안이 G2(사실 확인)를 대신하지 못한다 — 출처 검증은 별도 게이트다.
import { findBannedExpressions, type BannedExpressionRule, type ExpressionHit } from "@yunseo/domain";

export interface ScriptDraftStage {
  key: string;
  title: string;
  /** 이 단이 답해야 하는 질문 */
  question: string;
}

export interface ScriptDraftRequest {
  /** 사건 이름 */
  subject: string;
  /** 사건 일시 (KST 표시용 문자열) */
  when: string;
  /** G1 에서 운영자가 적은 핵심 관점 한 문장 */
  viewpoint: string;
  /** 발행 언어 (프리셋 값) */
  language: string;
  stages: readonly ScriptDraftStage[];
}

export interface ScriptDraftedStage {
  key: string;
  body: string;
}

export interface ScriptDraft {
  stages: ScriptDraftedStage[];
  draftedBy: "assistant";
}

export interface ScriptDrafter {
  /** 꺼져 있으면(설정이 없으면) false — 유스케이스가 호출 자체를 하지 않는다 */
  readonly enabled: boolean;
  draft(request: ScriptDraftRequest): Promise<ScriptDraft>;
}

export type DraftScriptResult =
  | { ok: true; draft: ScriptDraft; warnings: ExpressionHit[] }
  | { ok: false; reason: "disabled" | "failed" | "invalid_output" | "banned_expression"; message: string; hits: ExpressionHit[] };

export async function draftScript(drafter: ScriptDrafter, request: ScriptDraftRequest, rules: readonly BannedExpressionRule[]): Promise<DraftScriptResult> {
  if (!drafter.enabled) return { ok: false, reason: "disabled", message: "원고 초안 명령이 설정되지 않았다 (기본 꺼짐)", hits: [] };

  let draft: ScriptDraft;
  try {
    draft = await drafter.draft(request);
  } catch (error) {
    return { ok: false, reason: "failed", message: error instanceof Error ? error.message : String(error), hits: [] };
  }

  const allowed = new Set(request.stages.map((s) => s.key));
  const stray = draft.stages.filter((s) => !allowed.has(s.key)).map((s) => s.key);
  if (stray.length > 0) return { ok: false, reason: "invalid_output", message: `요청하지 않은 단: ${stray.join(", ")}`, hits: [] };

  const hits = draft.stages.flatMap((s) => findBannedExpressions(s.body, "body", rules));
  const blocked = hits.filter((h) => h.severity === "block");
  if (blocked.length > 0) return { ok: false, reason: "banned_expression", message: `금지 표현 ${blocked.length}건 — 초안을 버렸다`, hits };
  return { ok: true, draft: { stages: draft.stages, draftedBy: "assistant" }, warnings: hits };
}
