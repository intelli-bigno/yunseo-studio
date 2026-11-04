"use client";
import { useState } from "react";
import type { Piece } from "@/lib/model";

// 검수 (G3) — 02 문서 §5.3 체크리스트. 전 항목 체크 뒤 승인, 반려는 사유 필수.
const ITEMS = [
  "투자 권유로 읽히는 문장 없음 — 명령형 매수·매도, 수익 확약, 특정 종목 추천, 수치 단정",
  "금지 표현 검사 통과 (block 0, warn 은 사람이 읽고 판정)",
  "사실 / 시장 반응 / 해석 / 시나리오가 화면에서 구분돼 보인다",
  "출처 카드와 기준 시점이 있다",
  "이벤트 일시·시간대 정확, 오늘 기준으로 재확인함",
  "브랜드 자리표시자 없음, 고지 문구(확정본) 포함",
  "맞춤법 (발행 언어 기준)",
  "표지가 이전 게시물과 같은 틀, 차트는 한눈에 읽힘",
  "이 편을 내는 이유가 「채우려고」가 아니다",
];

export function ReviewPanel({ piece }: { piece: Piece }) {
  const items = piece.kind === "post" ? [...ITEMS, "이전 편과 나란히 읽었을 때 모순이 없다"] : ITEMS;
  const [checked, setChecked] = useState<boolean[]>(() => items.map(() => false));
  const [result, setResult] = useState<"approved" | "rejected" | null>(piece.gates.G3 === "passed" ? "approved" : null);
  const [reason, setReason] = useState("");
  const g2Open = piece.gates.G2 !== "passed";
  const all = checked.every(Boolean);

  return (
    <div className="split" style={{ marginTop: 24 }}>
      <div>
        {g2Open && <div className="alert" style={{ marginBottom: 12 }}>× G2 사실 확인이 끝나지 않아 G3 를 열 수 없습니다.</div>}
        <div className="rows" style={{ borderTop: "1px solid var(--c-line-strong)", opacity: g2Open ? 0.5 : 1 }}>
          {items.map((label, n) => (
            <label key={label} className="row" style={{ gridTemplateColumns: "20px 26px 1fr", cursor: "pointer" }}>
              <input type="checkbox" disabled={g2Open} checked={checked[n] ?? false} onChange={(e) => setChecked((xs) => xs.map((x, k) => (k === n ? e.target.checked : x)))} style={{ accentColor: "var(--c-accent)" }} />
              <span className="mono mute">{String(n + 1).padStart(2, "0")}</span>
              <span>{label}</span>
            </label>
          ))}
        </div>
      </div>
      <aside className="panel panel-pad" style={{ alignSelf: "start", display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="eyebrow">G3 · 최종 발행 판단</div>
        <div className="display" style={{ fontSize: 48 }}>
          {checked.filter(Boolean).length}
          <span className="mute" style={{ fontSize: 22 }}> / {items.length}</span>
        </div>
        {result === "approved" ? (
          <div>
            <span className="chip chip-accent">승인</span>
            <div className="mono mute" style={{ marginTop: 8 }}>승인 해시 {piece.hash ?? "7ab2e019"}</div>
          </div>
        ) : result === "rejected" ? (
          <div><span className="chip chip-solid">반려</span><div className="dim" style={{ marginTop: 8 }}>{reason}</div></div>
        ) : (
          <>
            <button className="btn btn-primary" disabled={!all || g2Open} onClick={() => setResult("approved")}>승인 — 발행 대기열로</button>
            <input className="input" placeholder="반려 사유 (필수)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <button className="btn" disabled={!reason.trim()} onClick={() => setResult("rejected")}>반려</button>
          </>
        )}
        <span className="mute" style={{ fontSize: "var(--fs-xs)" }}>승인 뒤 본문이 바뀌면 해시 불일치로 대기열에서 막힌다.</span>
      </aside>
    </div>
  );
}
