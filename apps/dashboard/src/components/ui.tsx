import { GATES, type QueueState } from "@/lib/logic";
import { GATE_LABEL, KIND_LABEL, KIND_NO, STATUS_LABEL, type Kind, type Piece, type Status } from "@/lib/model";

export function KindMark({ kind }: { kind: Kind }) {
  return (
    <span className={`kind kind-${kind}`} title={KIND_LABEL[kind]} aria-label={KIND_LABEL[kind]}>
      {KIND_NO[kind]}
    </span>
  );
}

const SOLID: Status[] = ["idea", "evidence_wait", "in_review"];
export function StatusChip({ status }: { status: Status }) {
  return <span className={`chip${SOLID.includes(status) ? " chip-solid" : ""}`}>{STATUS_LABEL[status]}</span>;
}

export function GateTrack({ piece, large = false }: { piece: Piece; large?: boolean }) {
  return (
    <span className={`gates${large ? " gates-lg" : ""}`} aria-label="사람 게이트">
      {GATES.map((g) => (
        <span key={g} className={`gate gate-${piece.gates[g]}`} title={`${g} ${GATE_LABEL[g]} — ${piece.gates[g]}`}>
          {g}
          {large && <span>{GATE_LABEL[g]}</span>}
        </span>
      ))}
    </span>
  );
}

export function Kbd({ children }: { children: string }) {
  return <kbd className="kbd">{children}</kbd>;
}

export function QueueChip({ s }: { s: QueueState }) {
  if (s === "ready") return <span className="chip chip-accent">준비됨</span>;
  if (s === "needs_g3") return <span className="chip chip-solid">G3 대기</span>;
  if (s === "mismatch") return <span className="chip chip-solid">해시 불일치</span>;
  return <span className="chip">게시됨</span>;
}
