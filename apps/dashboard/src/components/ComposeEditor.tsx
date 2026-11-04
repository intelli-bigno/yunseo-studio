"use client";
import { useState } from "react";
import type { Piece } from "@/lib/model";

// 작성 — 왼쪽 단 목록 · 가운데 폼 · 오른쪽 점검. 종류마다 단만 바뀐다(①5단 · ②4단 · ③스레드 단계).
export function ComposeEditor({ piece }: { piece: Piece }) {
  const [stages, setStages] = useState(piece.stages);
  const [i, setI] = useState(0);
  const [saved, setSaved] = useState<string | null>(null);
  const cur = stages[i];
  const empty = stages.filter((s) => !s.body.trim()).length;

  if (!cur) {
    return (
      <div className="panel panel-pad" style={{ marginTop: 24 }}>
        <div className="h3">스토리 편은 단 구성이 없습니다</div>
        <p className="dim">이번 주의 변수 표(편성 화면 오른쪽 레일)가 그대로 스토리 한 장이 됩니다.</p>
      </div>
    );
  }

  return (
    <div className="editor">
      <div className="stage-list" role="tablist" aria-label="단">
        {stages.map((s, n) => (
          <button key={s.key} aria-current={n === i} onClick={() => setI(n)}>
            <span className="n">{n + 1}</span>
            <span>{s.title}</span>
            <span className={s.body.trim() ? "accent" : "alert"} style={{ fontSize: 10 }}>{s.body.trim() ? "✓" : "빈칸"}</span>
          </button>
        ))}
      </div>

      <div>
        <div className="eyebrow">{i + 1}단 · {cur.key}</div>
        <h2 className="h2" style={{ margin: "6px 0 4px" }}>{cur.title}</h2>
        <div className="dim" style={{ marginBottom: 14 }}>{cur.question}</div>
        <textarea
          className="textarea"
          style={{ minHeight: 260 }}
          value={cur.body}
          placeholder="문장마다 구분 표시(■ 사실 ▲ 시장 반응 ◆ 해석 ○ 시나리오)를 붙여 쓴다"
          onChange={(e) => setStages((xs) => xs.map((s, n) => (n === i ? { ...s, body: e.target.value } : s)))}
        />
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
          <span className="mute" style={{ fontSize: "var(--fs-xs)" }}>{cur.body.length}자 · 본문 카드 ≤ 220자(가정값)</span>
          <span style={{ display: "flex", gap: 8 }}>
            <button className="btn" disabled={i === 0} onClick={() => setI(i - 1)}>이전 단</button>
            <button className="btn" disabled={i === stages.length - 1} onClick={() => setI(i + 1)}>다음 단</button>
            <button className="btn btn-primary" onClick={() => setSaved(new Date().toTimeString().slice(0, 5))}>저장</button>
          </span>
        </div>
        {saved && <div className="mute" style={{ marginTop: 8, fontSize: "var(--fs-xs)" }}>{saved} 저장됨 (목업 — 실제 저장은 M2 유스케이스 연결 뒤)</div>}
      </div>

      <aside className="panel panel-pad" style={{ alignSelf: "start" }}>
        <div className="eyebrow">점검</div>
        <div className="checklist" style={{ marginTop: 10 }}>
          <Row ok={empty === 0} label={empty === 0 ? "모든 단이 채워짐" : `빈 단 ${empty}개 — 다음 탭으로 못 감`} />
          <Row ok={cur.body.length <= 220} label="본문 길이 상한 이내" />
          <Row ok={!/(반드시 오른다|무조건|매수하세요|확실한 수익)/.test(cur.body)} label="금지 표현 없음 (block 0)" />
          <Row ok={!/\d/.test(cur.body) || piece.claims.length > 0} label="본문 수치마다 claim 연결" />
        </div>
        <hr className="rule" style={{ margin: "16px 0" }} />
        <div className="eyebrow">구분 표시</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 8, fontSize: "var(--fs-sm)" }}>
          <span><span className="mark">■</span>사실</span>
          <span><span className="mark">▲</span>시장 반응</span>
          <span><span className="mark">◆</span>해석</span>
          <span><span className="mark">○</span>시나리오</span>
          <span className="u-res">조사</span>
          <span className="u-exp">직접 경험</span>
        </div>
      </aside>
    </div>
  );
}

function Row({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="check">
      <span className={ok ? "accent" : "alert"}>{ok ? "✓" : "×"}</span>
      <span className={ok ? "dim" : ""}>{label}</span>
    </div>
  );
}
