// [L9] 검수 탭에 보일 G3 승인 전 점검 — 도메인이 낸 행동 목록(availableActions)에서 승인(또는 다시 승인)을 막는 이유만 고른다.
import type { ActionOption } from "@yunseo/domain";

export function g3Issues(actions: readonly ActionOption[]): string[] {
  return actions.find((a) => a.action === "approve" || a.action === "reapprove")?.issues ?? [];
}
