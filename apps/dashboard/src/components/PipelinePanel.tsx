"use client";
// [L2] 렌더 → 미리보기 → 업로드 묶음 — 버튼 하나로 다음 단계를 진행한다. 포트가 주입되지 않은 단계는 비활성 + 이유.
// 계약 포트(CardRenderer·ReelComposer·UploadPackager)는 서버에서만 불린다 — 이 섬은 서버 액션과 내려받기 주소만 안다.
import { useState } from "react";
import { Badge, Button, Card, CardFrame, CardHeader, CardStage, Check, CheckList, Notice, Paper, Split, Stack, Text, TextLink, Thumb, Thumbs, type Media } from "@yunseo/ui";
import { pipelineAction } from "@/app/content/actions";
import { nextPipelineStep } from "@/lib/pipeline-flow";
import { Outcome, useServerAction } from "./AuthoringKit";

export interface PipelineStepView {
  key: "render" | "reel" | "bundle";
  enabled: boolean;
  reason: string | null;
  done: boolean;
}

export interface PipelineProps {
  pieceId: string;
  steps: PipelineStepView[];
  stale: boolean;
  documentErrors: string[];
  cards: { name: string; main: Media; thumb: Media; alt: string }[];
  caption: string | null;
  hashtags: string[];
  warnings: string[];
  bundle: { name: string; bytes: number; sha256: string } | null;
}

const LABEL = { render: "카드 렌더", reel: "릴스 합성", bundle: "업로드 묶음" } as const;

export function PipelinePanel({ pieceId, steps, stale, documentErrors, cards, caption, hashtags, warnings, bundle }: PipelineProps) {
  const [at, setAt] = useState(0);
  const { pending, result, run } = useServerAction();
  const next = nextPipelineStep(steps);
  const anyOpen = steps.some((s) => s.enabled && !s.done);
  const cur = cards[at];

  return (
    <Split
      rail={
        <Card>
          <CardHeader title="렌더 → 묶음" />
          {/* [L9] 단계마다 버튼 — 카드 렌더 뒤 바로 릴스, 그다음 묶음(릴스 포함). 다음 차례 단계만 강조한다 */}
          {steps.map((s) => (
            <Stack key={s.key} direction="row" justify="between" align="center">
              <CheckList>
                <Check ok={s.done}>
                  {LABEL[s.key]} {s.done ? "완료" : s.enabled ? "가능" : `— ${s.reason}`}
                </Check>
              </CheckList>
              <Button variant={next?.key === s.key ? "primary" : "secondary"} disabled={!s.enabled || pending} onClick={() => run(() => pipelineAction(pieceId, s.key), `${LABEL[s.key]} 완료`)}>
                {s.done ? "다시" : "실행"}
              </Button>
            </Stack>
          ))}
          <Button variant="primary" block disabled={!anyOpen || pending} onClick={() => run(() => pipelineAction(pieceId, "all"), "카드·릴스·묶음 — 가능한 단계 완료")}>
            {pending ? "진행 중" : "카드·릴스·묶음 한 번에"}
          </Button>
          {bundle && (
            <Stack gap={1}>
              <TextLink href={`/api/pieces/${pieceId}/bundle`} download={bundle.name}>{bundle.name} 내려받기</TextLink>
              <Text size="label" tone="mute" mono>{`${Math.round(bundle.bytes / 1024)} KB · sha256 ${bundle.sha256.slice(0, 12)}`}</Text>
            </Stack>
          )}
          <Outcome result={result} />
        </Card>
      }
    >
      {stale && <Notice>기록된 산출물은 예전 내용으로 만든 것 — 지금 내용으로 다시 렌더한다</Notice>}
      {documentErrors.length > 0 && (
        <Card>
          <CardHeader title="렌더 입력(콘텐츠 정본) 오류" />
          <CheckList>
            {documentErrors.map((m) => (
              <Check key={m} ok={false}>{m}</Check>
            ))}
          </CheckList>
        </Card>
      )}
      {cur ? (
        <Card>
          <CardHeader title={`미리보기 ${at + 1} / ${cards.length}`} action={<Badge>{cur.name}</Badge>} />
          <Paper>
            <CardStage>
              <CardFrame media={cur.main} alt={cur.alt} aspect="4 / 5" />
            </CardStage>
          </Paper>
          <Thumbs>
            {cards.map((c, n) => (
              <Thumb key={c.name} media={c.thumb} current={n === at} label={`${n + 1}장`} onClick={() => setAt(n)} />
            ))}
          </Thumbs>
          {caption && <Text tone="dim">{caption}</Text>}
          {hashtags.length > 0 && <Text size="label" tone="mute">{hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}</Text>}
          {warnings.map((w) => (
            <Text key={w} size="label" tone="alert">⚠ {w}</Text>
          ))}
        </Card>
      ) : (
        <Card>
          <Text tone="mute">렌더한 카드가 없음 — {steps[0]?.reason ?? "「카드 렌더 실행」을 누른다"}</Text>
        </Card>
      )}
    </Split>
  );
}
