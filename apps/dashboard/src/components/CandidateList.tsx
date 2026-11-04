"use client";
import { useState } from "react";
import type { EventCandidate } from "@/lib/model";

const Q_LABEL = { a: "가격 영향", b: "예정 일정", c: "독자 관심", d: "직접 경험", e: "시나리오 가능" } as const;

export function CandidateList({ initial }: { initial: EventCandidate[] }) {
  const [items, setItems] = useState(initial);
  const [reasonFor, setReasonFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const decide = (id: string, d: EventCandidate["decision"]) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, decision: d } : x)));

  return (
    <div className="rows">
      {items.map((c) => (
        <div key={c.id} className="row" style={{ gridTemplateColumns: "1fr", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <span>
              <span className="mono mute">{c.date.slice(5).replace("-", ".")}</span> {c.label}
            </span>
            {c.decision && <span className={`chip${c.decision === "major" ? " chip-accent" : ""}`}>{c.decision}</span>}
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {(Object.keys(Q_LABEL) as (keyof typeof Q_LABEL)[]).map((k) => (
              <span key={k} className="chip" style={{ opacity: c.questions[k] ? 1 : 0.4 }} title={c.questions[k] ? "예" : "아니오"}>
                {k} {Q_LABEL[k]}
              </span>
            ))}
          </div>
          {reasonFor === c.id ? (
            <div style={{ display: "flex", gap: 6 }}>
              <input className="input" autoFocus placeholder="major 로 올리는 이유 (필수)" value={reason} onChange={(e) => setReason(e.target.value)} />
              <button className="btn btn-primary" disabled={!reason.trim()} onClick={() => { decide(c.id, "major"); setReasonFor(null); setReason(""); }}>확정</button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn" onClick={() => setReasonFor(c.id)}>major</button>
              <button className="btn" onClick={() => decide(c.id, "watch")}>watch</button>
              <button className="btn btn-ghost" onClick={() => decide(c.id, "skip")}>skip</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
