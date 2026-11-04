// 화면 판단 로직(순수 함수) — 테스트 대상.
import type { GateId, Piece, QueueItem } from "./model";

export const GATES: GateId[] = ["G1", "G2", "G3"];

/** 지금 이 편이 서 있는 게이트(첫 미통과). 전부 통과면 null */
export function currentGate(p: Piece): GateId | null {
  return GATES.find((g) => p.gates[g] !== "passed") ?? null;
}

/** 내가(사람이) 눌러야 하는 게이트가 있는 편 */
export function awaitingMe(pieces: Piece[]): Piece[] {
  return pieces.filter((p) => GATES.some((g) => p.gates[g] === "waiting"));
}

/** 막힌 편 — 오늘 화면 맨 위 */
export function blocked(pieces: Piece[]): Piece[] {
  return pieces.filter((p) => GATES.some((g) => p.gates[g] === "blocked") || p.status === "evidence_wait");
}

export type QueueState = "ready" | "needs_g3" | "mismatch" | "posted";

/** 발행 대기열 행 상태 — 승인 뒤 수정되면 해시 불일치로 막는다(06 §4) */
export function queueState(q: QueueItem): QueueState {
  if (q.postedUrl) return "posted";
  if (!q.approvedHash) return "needs_g3";
  return q.approvedHash === q.currentHash ? "ready" : "mismatch";
}

export function queueSummary(items: QueueItem[]): Record<QueueState, number> {
  const out: Record<QueueState, number> = { ready: 0, needs_g3: 0, mismatch: 0, posted: 0 };
  for (const q of items) out[queueState(q)] += 1;
  return out;
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"] as const;

export function weekday(iso: string): string {
  return WEEKDAY[new Date(`${iso.slice(0, 10)}T00:00:00Z`).getUTCDay()] ?? "";
}

export function weekDates(start: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** 출처 편집 점검 — G2 를 막는 이유 목록 */
export function claimIssues(c: Piece["claims"][number]): string[] {
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
