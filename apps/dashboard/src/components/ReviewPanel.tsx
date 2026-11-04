"use client";
import { useState } from "react";
import { Badge, Button, Card, CardHeader, Checkbox, Input, List, Metric, Notice, Split, Text } from "@yunseo/ui";
import type { Piece } from "@/lib/model";

// 검수 (G3) — 전 항목 체크 뒤 승인, 반려는 사유 필수.
const ITEMS = [
  "투자 권유로 읽히는 문장 없음",
  "금지 표현 검사 통과",
  "사실·반응·해석·시나리오가 구분돼 보임",
  "출처와 기준 시점 있음",
  "이벤트 일시·시간대 재확인",
  "자리표시자 없음, 고지 문구 포함",
  "맞춤법",
  "표지 틀 일치, 차트 한눈에 읽힘",
  "채우려고 내는 편이 아님",
];

export function ReviewPanel({ piece }: { piece: Piece }) {
  const items = piece.kind === "post" ? [...ITEMS, "이전 편과 모순 없음"] : ITEMS;
  const [checked, setChecked] = useState<boolean[]>(() => items.map(() => false));
  const [result, setResult] = useState<"approved" | "rejected" | null>(piece.gates.G3 === "passed" ? "approved" : null);
  const [reason, setReason] = useState("");
  const g2Open = piece.gates.G2 !== "passed";
  const all = checked.every(Boolean);

  return (
    <Split
      rail={
        <Card>
          <CardHeader title="G3 발행 판단" />
          <Metric size="hero" value={checked.filter(Boolean).length} unit={`/ ${items.length}`} label="확인" />
          {result === "approved" ? (
            <>
              <Badge tone="accent">승인</Badge>
              <Text size="label" tone="mute" mono>{piece.hash ?? "7ab2e019"}</Text>
            </>
          ) : result === "rejected" ? (
            <>
              <Badge tone="alert">반려</Badge>
              <Text tone="dim">{reason}</Text>
            </>
          ) : (
            <>
              <Button variant="primary" block disabled={!all || g2Open} onClick={() => setResult("approved")}>승인</Button>
              <Input placeholder="반려 사유" value={reason} onChange={(e) => setReason(e.target.value)} />
              <Button block disabled={!reason.trim()} onClick={() => setResult("rejected")}>반려</Button>
            </>
          )}
        </Card>
      }
    >
      <Card>
        {g2Open && <Notice>× G2 사실 확인 전</Notice>}
        <List>
          {items.map((label, n) => (
            <Checkbox
              key={label}
              lead={String(n + 1).padStart(2, "0")}
              label={label}
              disabled={g2Open}
              checked={checked[n] ?? false}
              onChange={(e) => setChecked((xs) => xs.map((x, k) => (k === n ? e.target.checked : x)))}
            />
          ))}
        </List>
      </Card>
    </Split>
  );
}
