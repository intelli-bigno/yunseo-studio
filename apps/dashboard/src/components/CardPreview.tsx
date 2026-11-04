"use client";
import { useEffect, useState } from "react";
import { Card, CardFrame, CardHeader, CardStage, Check, CheckList, EmptyState, IconButton, KeyHint, Metric, Paper, Split, Thumb, Thumbs } from "@yunseo/ui";
import type { Piece } from "@/lib/model";

// 미리보기 — 밝은 카드 표지를 종이 틀 위에서 폰 비율로. ← → 로 장 넘김.
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
    <Split
      rail={
        <Card>
          <CardHeader title="장" action={<KeyHint keys={["←", "→"]} />} />
          <Metric size="hero" value={cards.length ? i + 1 : 0} unit={`/ ${cards.length}`} label={set?.id === "v2" ? "4:5 · 1080×1350" : "3:4 · 1080×1440"} />
          <CheckList>
            <Check ok>마지막 장 출처</Check>
            <Check ok={false}>브랜드 자리표시자 남음</Check>
          </CheckList>
        </Card>
      }
    >
      {cards.length ? (
        <Paper>
          <CardStage>
            <IconButton label="이전 장" disabled={i === 0} onClick={() => setI(i - 1)}>←</IconButton>
            <CardFrame src={`/api/cards/${cards[i]}`} alt={`카드 ${i + 1}장`} aspect={set?.aspect ?? "3 / 4"} />
            <IconButton label="다음 장" disabled={i === cards.length - 1} onClick={() => setI(i + 1)}>→</IconButton>
          </CardStage>
          <Thumbs>
            {cards.map((c, n) => (
              <Thumb key={c} src={`/api/cards/${c}`} current={n === i} label={`${n + 1}장`} onClick={() => setI(n)} />
            ))}
          </Thumbs>
        </Paper>
      ) : (
        <Card>
          <EmptyState image="/img/empty.jpg" title={piece.cards?.length ? "불러오는 중" : "렌더된 카드 없음"} />
        </Card>
      )}
    </Split>
  );
}
