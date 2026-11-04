"use client";
import { useEffect, useState } from "react";
import type { Piece } from "@/lib/model";

// 미리보기 — 밝은 카드 표지를 「종이」 틀 위에서 폰 비율(3:4)로. ← → 로 장 넘김.
interface CardSet {
  id: string;
  label: string;
  names: string[];
  aspect: string;
}

export function CardPreview({ piece }: { piece: Piece }) {
  const [set, setSet] = useState<CardSet | null>(null);
  const cards = piece.cards?.length ? (set?.names ?? []) : [];
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!piece.cards?.length) return;
    fetch("/api/cards")
      .then((r) => r.json() as Promise<CardSet>)
      .then(setSet)
      .catch(() => setSet(null));
  }, [piece.cards]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (e.key === "ArrowRight") setI((n) => Math.min(n + 1, cards.length - 1));
      if (e.key === "ArrowLeft") setI((n) => Math.max(n - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cards.length]);

  return (
    <div className="preview">
      <div className="paper">
        {cards.length ? (
          <>
            <div className="card-stage">
              <button className="round" aria-label="이전 장" disabled={i === 0} onClick={() => setI(i - 1)}>←</button>
              <div className="card-frame" style={{ aspectRatio: set?.aspect ?? "3 / 4" }}>
                <img src={`/api/cards/${cards[i]}`} alt={`카드 ${i + 1}장`} />
              </div>
              <button className="round" aria-label="다음 장" disabled={i === cards.length - 1} onClick={() => setI(i + 1)}>→</button>
            </div>
            <div className="thumbs">
              {cards.map((c, n) => (
                <button key={c} aria-current={n === i} aria-label={`${n + 1}장`} onClick={() => setI(n)}>
                  <img src={`/api/cards/${c}`} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          </>
        ) : (
          <div style={{ textAlign: "center", padding: "80px 0", color: "#5a554c" }}>
            아직 렌더된 카드가 없습니다 — 작성·출처 확인 뒤 렌더(M1 render-html 어댑터).
          </div>
        )}
      </div>
      <aside style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <div className="eyebrow">장</div>
          <div className="display" style={{ fontSize: 56 }}>
            {cards.length ? i + 1 : 0}
            <span className="mute" style={{ fontSize: 24 }}> / {cards.length}</span>
          </div>
        </div>
        <div className="checklist">
          <div className="check"><span className="accent">✓</span><span>{set?.id === "v2" ? "4:5 · 1080×1350" : "3:4 · 1080×1440"}</span></div>
          <div className="check"><span className="accent">✓</span><span>출처 장 포함 (마지막 장)</span></div>
          <div className="check"><span className="alert">×</span><span>브랜드 자리표시자 `TBD` 남음 — 이름 확정 전</span></div>
        </div>
        <p className="mute" style={{ fontSize: "var(--fs-xs)", margin: 0 }}>
          {set ? `카드 이미지: ${set.label}. 자리표시 예시 — 발행 불가.` : "카드 묶음을 불러오는 중…"}
        </p>
        <div style={{ display: "flex", gap: 6 }}><kbd className="kbd">←</kbd><kbd className="kbd">→</kbd><span className="mute">장 넘김</span></div>
      </aside>
    </div>
  );
}
