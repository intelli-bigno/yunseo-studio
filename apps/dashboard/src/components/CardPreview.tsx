"use client";
import { useEffect, useState } from "react";
import { Card, CardFrame, CardHeader, CardStage, Check, CheckList, EmptyState, IconButton, KeyHint, Metric, Paper, Split, Thumb, Thumbs, type Media } from "@yunseo/ui";

// 미리보기 — 밝은 카드 표지를 종이 틀 위에서 폰 비율로. ← → 로 장 넘김.
// 카드 목록·이미지 주소·크기는 서버가 정해 props 로 준다(브라우저가 따로 물어보지 않는다). 이 섬에는 장 번호와 키 입력만 있다.
export interface PreviewCard {
  name: string;
  main: Media;
  thumb: Media;
}

export function CardPreview({ cards, setId, aspect, hasCards, art }: { cards: PreviewCard[]; setId: string; aspect: string; hasCards: boolean; art: Media }) {
  const [i, setI] = useState(0);
  const count = cards.length;
  const current = cards[i];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (e.key === "ArrowRight") setI((n) => Math.min(n + 1, count - 1));
      if (e.key === "ArrowLeft") setI((n) => Math.max(n - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [count]);

  return (
    <Split
      rail={
        <Card>
          <CardHeader title="장" action={<KeyHint keys={["←", "→"]} />} />
          <Metric size="hero" value={count ? i + 1 : 0} unit={`/ ${count}`} label={setId === "v2" ? "4:5 · 1080×1350" : "3:4 · 1080×1440"} />
          <CheckList>
            <Check ok>마지막 장 출처</Check>
            <Check ok={false}>브랜드 자리표시자 남음</Check>
          </CheckList>
        </Card>
      }
    >
      {current ? (
        <Paper>
          <CardStage>
            <IconButton label="이전 장" disabled={i === 0} onClick={() => setI(i - 1)}>←</IconButton>
            <CardFrame media={current.main} alt={`카드 ${i + 1}장`} aspect={aspect} />
            <IconButton label="다음 장" disabled={i === count - 1} onClick={() => setI(i + 1)}>→</IconButton>
          </CardStage>
          <Thumbs>
            {cards.map((c, n) => (
              <Thumb key={c.name} media={c.thumb} current={n === i} label={`${n + 1}장`} onClick={() => setI(n)} />
            ))}
          </Thumbs>
        </Paper>
      ) : (
        <Card>
          <EmptyState media={art} title={hasCards ? "불러오는 중" : "렌더된 카드 없음"} />
        </Card>
      )}
    </Split>
  );
}
