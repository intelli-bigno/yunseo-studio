// 도메인 표시 — 편 종류·상태·게이트·대기열 상태를 @yunseo/ui 컴포넌트로 그린다.
import { GATE_IDS, type GateState, type Piece, type PieceKind, type PieceStatus } from "@yunseo/domain";
import { Badge, Steps, type StepState } from "@yunseo/ui";
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
