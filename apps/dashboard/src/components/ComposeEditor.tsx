"use client";
import { useState } from "react";
import type { Piece } from "@yunseo/domain";
import { Button, Card, CardHeader, Check, CheckList, EmptyState, Glyph, List, ListItem, Metric, Split, Stack, Text, Textarea, type Media } from "@yunseo/ui";

// 작성 — 단 목록 · 가운데 쓰기 · 오른쪽 점검. 종류마다 단만 바뀐다.
export function ComposeEditor({ piece, art }: { piece: Piece; art: Media }) {
  const [stages, setStages] = useState(piece.stages);
  const [i, setI] = useState(0);
  const [saved, setSaved] = useState<string | null>(null);
  const cur = stages[i];
  const empty = stages.filter((s) => !s.body.trim()).length;

  if (!cur) return <Card><EmptyState media={art} title="스토리 편은 단이 없음" /></Card>;

  return (
    <Split
      rail={
        <>
          <Card>
            <CardHeader title="단" />
            <List>
              {stages.map((s, n) => (
                <ListItem
                  key={s.key}
                  as="button"
                  type="button"
                  current={n === i}
                  onClick={() => setI(n)}
                  leading={<Text size="title" tone="mute">{n + 1}</Text>}
                  title={s.title}
                  trailing={<Text size="label" tone={s.body.trim() ? "accent" : "alert"}>{s.body.trim() ? "✓" : "빈칸"}</Text>}
                />
              ))}
            </List>
          </Card>
          <Card>
            <CardHeader title="점검" />
            <CheckList>
              <Check ok={empty === 0}>{empty === 0 ? "모든 단 채움" : `빈 단 ${empty}`}</Check>
              <Check ok={cur.body.length <= 220}>220자 이내</Check>
              <Check ok={!/(반드시 오른다|무조건|매수하세요|확실한 수익)/.test(cur.body)}>금지 표현 없음</Check>
              <Check ok={!/\d/.test(cur.body) || piece.claims.length > 0}>수치마다 출처 연결</Check>
            </CheckList>
          </Card>
          <Card tone="inset">
            <Stack direction="row" gap={4} wrap>
              <Text size="label"><Glyph>■</Glyph>사실</Text>
              <Text size="label"><Glyph>▲</Glyph>시장 반응</Text>
              <Text size="label"><Glyph>◆</Glyph>해석</Text>
              <Text size="label"><Glyph>○</Glyph>시나리오</Text>
            </Stack>
          </Card>
        </>
      }
    >
      <Card>
        <Stack direction="row" justify="between" align="end">
          <Stack gap={1}>
            <Text size="label" tone="mute">{i + 1}단</Text>
            <Text as="h2" size="heading">{cur.title}</Text>
            <Text tone="dim">{cur.question}</Text>
          </Stack>
          <Metric value={cur.body.length} unit="/ 220" label="글자" tone={cur.body.length > 220 ? "alert" : "default"} />
        </Stack>
        <Textarea
          tall
          value={cur.body}
          placeholder="■ 사실 ▲ 시장 반응 ◆ 해석 ○ 시나리오"
          onChange={(e) => setStages((xs) => xs.map((s, n) => (n === i ? { ...s, body: e.target.value } : s)))}
        />
        <Stack direction="row" justify="between" align="center">
          <Text size="label" tone="mute">{saved ? `${saved} 저장됨` : ""}</Text>
          <Stack direction="row" gap={2}>
            <Button disabled={i === 0} onClick={() => setI(i - 1)}>이전</Button>
            <Button disabled={i === stages.length - 1} onClick={() => setI(i + 1)}>다음</Button>
            <Button variant="primary" onClick={() => setSaved(new Date().toTimeString().slice(0, 5))}>저장</Button>
          </Stack>
        </Stack>
      </Card>
    </Split>
  );
}
