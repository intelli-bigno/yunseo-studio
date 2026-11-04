// 게이트·발행 대기열 판단 규칙(순수 함수). 사람 승인 게이트는 도메인 규칙이다 — 화면이 우회할 수 없다(04 규칙 5).
import { GATE_IDS, type GateId, type Piece, type PieceClaim, type QueueItem } from "./model";

/** 지금 이 편이 서 있는 게이트(첫 미통과). 전부 통과면 null */
export function currentGate(p: Piece): GateId | null {
  return GATE_IDS.find((g) => p.gates[g] !== "passed") ?? null;
}

/** 내가(사람이) 눌러야 하는 게이트가 있는 편 */
export function awaitingMe(pieces: readonly Piece[]): Piece[] {
  return pieces.filter((p) => GATE_IDS.some((g) => p.gates[g] === "waiting"));
}

/** 막힌 편 — 오늘 화면 맨 위 */
export function blocked(pieces: readonly Piece[]): Piece[] {
  return pieces.filter((p) => GATE_IDS.some((g) => p.gates[g] === "blocked") || p.status === "evidence_wait");
}

export type QueueState = "ready" | "needs_g3" | "mismatch" | "posted";

/** 발행 대기열 행 상태 — 승인 뒤 수정되면 해시 불일치로 막는다(06 §4) */
export function queueState(q: QueueItem): QueueState {
  if (q.postedUrl) return "posted";
  if (!q.approvedHash) return "needs_g3";
  return q.approvedHash === q.currentHash ? "ready" : "mismatch";
}

export function queueSummary(items: readonly QueueItem[]): Record<QueueState, number> {
  const out: Record<QueueState, number> = { ready: 0, needs_g3: 0, mismatch: 0, posted: 0 };
  for (const q of items) out[queueState(q)] += 1;
  return out;
}

/** 출처 편집 점검 — G2 를 막는 이유 목록 */
export function claimIssues(c: PieceClaim): string[] {
  const out: string[] = [];
  if (c.mark !== "view" && c.mark !== "scenario") {
    if (!c.url) out.push("출처 없음");
    if (c.url && !c.quote) out.push("원문 인용 없음");
    if (c.url && !c.accessedAt) out.push("접근일 없음");
  }
  if (!c.asOf) out.push("기준 시점 없음");
  if (!c.verified) out.push("사람 확인 전");
  return out;
}
