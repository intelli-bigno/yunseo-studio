"use server";
// [L2] 콘텐츠 쓰기 — 서버 액션. 화면(클라이언트 섬)은 이 함수만 부르고, 판단은 전부 유스케이스 → 도메인 규칙이 한다(UI 로 우회 불가).
// 결과는 직렬화 가능한 값으로 돌려준다: 성공 { ok: true } / 실패 { ok: false, error, issues, conflict }.
import { revalidatePath } from "next/cache";
import { AuthoringRuleError, type ActionInput, type AuthoringKind, type EditMeta, type GateAction, type PiecePatch } from "@yunseo/domain";
import { PieceNotFoundError, PipelineStepError, RevisionConflictError } from "@yunseo/application";
import { authoring, operatorName, pipeline } from "@/server/studio";

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string; issues: string[]; conflict: boolean };

function fail(error: unknown): { ok: false; error: string; issues: string[]; conflict: boolean } {
  if (error instanceof AuthoringRuleError) return { ok: false, error: "규칙에 막힘", issues: error.issues, conflict: false };
  if (error instanceof RevisionConflictError) return { ok: false, error: "다른 곳에서 먼저 저장됨 — 새로 읽은 뒤 다시 고치세요", issues: [], conflict: true };
  if (error instanceof PipelineStepError) return { ok: false, error: error.reason, issues: [], conflict: false };
  if (error instanceof PieceNotFoundError) return { ok: false, error: error.message, issues: [], conflict: false };
  return { ok: false, error: error instanceof Error ? error.message : "알 수 없는 오류", issues: [], conflict: false };
}

/** 편 하나가 바뀌면 그 편과 목록·오늘·발행 화면을 바로 다시 그린다(ISR 60초를 기다리지 않는다) */
function touched(id: string) {
  revalidatePath(`/content/${id}`);
  revalidatePath("/content");
  revalidatePath("/");
  revalidatePath("/publish");
  revalidatePath("/schedule");
}

const who = (actor: string | undefined) => actor?.trim() || operatorName();

/** 새 편 폼(클라이언트) — 오류를 화면에 돌려준다 */
export async function createPieceChecked(input: { kind: AuthoringKind; title: string; slot: string; viewpoint: string; preIssueId: string | null; actor: string }): Promise<ActionResult<{ id: string }>> {
  try {
    const { id } = await authoring().createPiece({ ...input, actor: who(input.actor) });
    touched(id);
    return { ok: true, id };
  } catch (error) {
    return fail(error);
  }
}

export async function seedDemoAction(): Promise<void> {
  await authoring().seedDemo();
  revalidatePath("/", "layout");
}

export async function savePieceAction(id: string, expectedRevision: number, patch: PiecePatch, meta: Omit<EditMeta, "at">): Promise<ActionResult<{ revision: number; invalidated: string[] }>> {
  try {
    const r = await authoring().savePiece(id, { expectedRevision, patch, meta: { ...meta, actor: who(meta.actor) } });
    touched(id);
    if (patch.preIssueId) revalidatePath(`/content/${patch.preIssueId}`);
    return { ok: true, revision: r.revision, invalidated: r.invalidated };
  } catch (error) {
    return fail(error);
  }
}

export async function confirmClaimAction(id: string, expectedRevision: number, claimId: string, actor: string): Promise<ActionResult<{ revision: number }>> {
  try {
    const r = await authoring().confirmClaim(id, { expectedRevision, claimId, actor: who(actor) });
    touched(id);
    return { ok: true, revision: r.revision };
  } catch (error) {
    return fail(error);
  }
}

export async function gateAction(id: string, expectedRevision: number, action: GateAction, input: Omit<ActionInput, "at">): Promise<ActionResult<{ revision: number; status: string }>> {
  try {
    const r = await authoring().act(id, { expectedRevision, action, input: { ...input, actor: who(input.actor) } });
    touched(id);
    return { ok: true, revision: r.revision, status: r.status };
  } catch (error) {
    return fail(error);
  }
}

export async function pipelineAction(id: string, step: "render" | "reel" | "bundle"): Promise<ActionResult> {
  try {
    const p = pipeline();
    if (step === "render") await p.render(id);
    else if (step === "reel") await p.composeReel(id);
    else await p.bundle(id);
    touched(id);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}
