"use client";
import { useMemo, useState } from "react";
import { claimIssues } from "@/lib/logic";
import { MARK_GLYPH, MARK_LABEL, type Claim, type Mark, type Piece } from "@/lib/model";

// 출처·기준 시점 편집기 (G2) — 왼쪽 구분 표시를 입힌 claim 목록, 오른쪽 선택 claim 상세 편집. 「확인」은 사람만.
type Filter = "all" | "open" | "done";

export function SourcesEditor({ piece }: { piece: Piece }) {
  const [claims, setClaims] = useState<Claim[]>(piece.claims);
  const [sel, setSel] = useState(0);
  const [filter, setFilter] = useState<Filter>("all");
  const open = claims.filter((c) => claimIssues(c).length > 0).length;
  const shown = useMemo(
    () => claims.map((c, i) => ({ c, i })).filter(({ c }) => (filter === "all" ? true : filter === "open" ? claimIssues(c).length > 0 : claimIssues(c).length === 0)),
    [claims, filter],
  );
  const cur = claims[sel];
  const set = (patch: Partial<Claim>) => setClaims((xs) => xs.map((c, i) => (i === sel ? { ...c, ...patch, verified: patch.verified ?? false } : c)));

  if (claims.length === 0) {
    return (
      <div className="panel panel-pad" style={{ marginTop: 24 }}>
        <div className="h3">아직 claim 이 없습니다</div>
        <p className="dim">작성 탭에서 수치·고유명사·날짜가 든 문장을 쓰면 여기서 출처와 기준 시점을 붙입니다.</p>
      </div>
    );
  }

  return (
    <div className="split" style={{ marginTop: 24, gridTemplateColumns: "minmax(0,1fr) 380px" }}>
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span className="dim">
            claim {claims.length}개 · <span className={open ? "alert" : "accent"}>남은 확인 {open}</span>
          </span>
          <div className="seg">
            {(["all", "open", "done"] as Filter[]).map((f) => (
              <a key={f} href="#" aria-current={filter === f ? "page" : undefined} onClick={(e) => { e.preventDefault(); setFilter(f); }}>
                {f === "all" ? "전체" : f === "open" ? "미확인" : "확인됨"}
              </a>
            ))}
          </div>
        </div>
        <div style={{ borderTop: "1px solid var(--c-line-strong)" }}>
          {shown.map(({ c, i }) => {
            const issues = claimIssues(c);
            return (
              <button key={c.id} className="claim" aria-current={i === sel} onClick={() => setSel(i)}>
                <span className="mark" title={MARK_LABEL[c.mark]}>{MARK_GLYPH[c.mark]}</span>
                <span style={{ minWidth: 0 }}>
                  <span className={c.basis === "experienced" ? "u-exp" : "u-res"}>{c.text}</span>
                  <div className="row-sub" style={{ marginTop: 4 }}>
                    {c.publisher ?? "출처 없음"} · 기준 {c.asOf ? c.asOf.replace("T", " ") : "—"}
                  </div>
                </span>
                {issues.length ? <span className="chip chip-solid">{issues[0]}{issues.length > 1 ? ` +${issues.length - 1}` : ""}</span> : <span className="chip chip-accent">확인됨</span>}
              </button>
            );
          })}
        </div>
      </div>

      {cur && (
        <aside className="panel panel-pad" style={{ alignSelf: "start", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span className="eyebrow">claim {cur.id}</span>
            <span className="mono mute">{sel + 1}/{claims.length}</span>
          </div>
          <div className="field">
            <label>구분</label>
            <select className="select" value={cur.mark} onChange={(e) => set({ mark: e.target.value as Mark })}>
              {(Object.keys(MARK_LABEL) as Mark[]).map((m) => (
                <option key={m} value={m}>{MARK_GLYPH[m]} {MARK_LABEL[m]}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>문장</label>
            <textarea className="textarea" style={{ minHeight: 64 }} value={cur.text} onChange={(e) => set({ text: e.target.value })} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div className="field">
              <label>발행처</label>
              <input className="input" value={cur.publisher ?? ""} onChange={(e) => set({ publisher: e.target.value || null })} />
            </div>
            <div className="field">
              <label>근거</label>
              <select className="select" value={cur.basis} onChange={(e) => set({ basis: e.target.value as Claim["basis"] })}>
                <option value="research">조사</option>
                <option value="experienced">직접 경험</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label>출처 URL</label>
            <input className={`input${!cur.url && cur.mark !== "view" && cur.mark !== "scenario" ? " input-warn" : ""}`} value={cur.url ?? ""} placeholder="https://" onChange={(e) => set({ url: e.target.value || null })} />
          </div>
          <div className="field">
            <label>원문 인용</label>
            <input className="input" value={cur.quote ?? ""} onChange={(e) => set({ quote: e.target.value || null })} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.3fr", gap: 10 }}>
            <div className="field">
              <label>접근일</label>
              <input className="input mono" type="date" value={cur.accessedAt ?? ""} onChange={(e) => set({ accessedAt: e.target.value || null })} />
            </div>
            <div className="field">
              <label>기준 시점 (분 단위, KST)</label>
              <input className={`input mono${!cur.asOf ? " input-warn" : ""}`} type="datetime-local" value={cur.asOf ?? ""} onChange={(e) => set({ asOf: e.target.value || null })} />
            </div>
          </div>
          <div className="checklist">
            {claimIssues(cur).map((m) => (
              <div key={m} className="check"><span className="alert">×</span><span>{m}</span></div>
            ))}
          </div>
          <button
            className="btn btn-primary"
            disabled={claimIssues({ ...cur, verified: true }).length > 0 || cur.verified}
            onClick={() => setClaims((xs) => xs.map((c, i) => (i === sel ? { ...c, verified: true } : c)))}
          >
            {cur.verified ? "확인됨" : "원문과 대조했음 — 확인"}
          </button>
          <span className="mute" style={{ fontSize: "var(--fs-xs)" }}>값을 고치면 확인이 풀린다. 확인은 사람만 누른다.</span>
        </aside>
      )}
    </div>
  );
}
