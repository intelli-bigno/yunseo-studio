// 도메인 표시 — 편 종류·상태·게이트·대기열 상태를 @yunseo/ui 컴포넌트로 그린다.
import { GATE_IDS, type GateState, type Piece, type PieceKind, type PieceStatus, type QueueState } from "@yunseo/domain";
import { Badge, Progress, Steps, type StepState } from "@yunseo/ui";
import { GATE_LABEL, KIND_LABEL, STATUS_LABEL } from "@/lib/labels";

export function KindMark({ kind }: { kind: PieceKind }) {
  return (
    <Badge tone={kind === "pre" || kind === "post" ? "solid" : "neutral"} title={KIND_LABEL[kind]}>
      {KIND_LABEL[kind]}
    </Badge>
  );
}

const SOLID: PieceStatus[] = ["idea", "evidence_wait", "in_review"];
export function StatusChip({ status }: { status: PieceStatus }) {
  return <Badge tone={SOLID.includes(status) ? "solid" : "neutral"}>{STATUS_LABEL[status]}</Badge>;
}

const STEP: Record<GateState, StepState> = { passed: "done", waiting: "wait", blocked: "block", todo: "todo" };
export function GateTrack({ piece, large = false }: { piece: Piece; large?: boolean }) {
  return (
    <Steps
      label="사람 게이트"
      size={large ? "md" : "sm"}
      items={GATE_IDS.map((g) => ({ key: g, label: large ? `${g} ${GATE_LABEL[g]}` : g, state: STEP[piece.gates[g]], title: `${g} ${GATE_LABEL[g]}` }))}
    />
  );
}

export function QueueChip({ s }: { s: QueueState }) {
  if (s === "ready") return <Badge tone="accent">준비됨</Badge>;
  if (s === "needs_g3") return <Badge tone="solid">G3 대기</Badge>;
  if (s === "mismatch") return <Badge tone="alert">해시 불일치</Badge>;
  return <Badge>게시됨</Badge>;
}

/** 한 편의 길: 선정 → 작성 → 출처 → 검수 → 발행 */
const PIPE = ["선정", "작성", "출처", "검수", "발행"] as const;
const AT: Record<PieceStatus, number> = { idea: 0, selected: 1, evidence_wait: 1, drafted: 2, verified: 3, in_review: 3, approved: 4, published: 5 };
export function Pipeline({ status }: { status: PieceStatus }) {
  const at = AT[status];
  return <Progress items={PIPE.map((label, i) => ({ label, state: i < at ? "done" : i === at ? "now" : "todo" }))} />;
}
