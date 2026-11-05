"use client";
// [L2] 상태·게이트 행동 — 지금 상태에서 허용된 행동만, 막는 이유와 함께. 누르면 서버가 도메인 규칙으로 다시 판단한다(화면 우회 불가).
// G3 승인·반려는 검수 탭(ReviewPanel)에서 체크리스트와 함께 한다.
import { useState } from "react";
import type { ActionOption, GateAction } from "@yunseo/domain";
import { Badge, Button, Card, CardHeader, Check, CheckList, Field, FieldRow, Input, Select, Stack, Text } from "@yunseo/ui";
import { gateAction } from "@/app/content/actions";
import { Outcome, useServerAction } from "./AuthoringKit";

const LABEL: Record<GateAction, string> = {
  select: "G1 선정 — 주제·관점 확정",
  start_draft: "작성 시작",
  await_evidence: "자료 대기로",
  evidence_ready: "자료 확보 — 작성으로",
  verify: "G2 사실 확인 통과",
  reopen: "다시 작성으로",
  request_review: "검수 요청",
  approve: "G3 승인",
  reject: "G3 반려",
  publish: "발행됨으로 표시",
  reapprove: "G3 다시 승인",
};
const IN_REVIEW_TAB: GateAction[] = ["approve", "reject", "reapprove"];

export function GatePanel({ pieceId, kind, revision, actor, actions }: { pieceId: string; kind: string; revision: number; actor: string; actions: ActionOption[] }) {
  const [name, setName] = useState(actor);
  const [importance, setImportance] = useState<"major" | "watch">("major");
  const { pending, result, run } = useServerAction();
  const shown = actions.filter((a) => !IN_REVIEW_TAB.includes(a.action));
  if (shown.length === 0) return null;
  const needsImportance = shown.some((a) => a.action === "select") && kind !== "research";

  return (
    <Card>
      <CardHeader title="다음 단계" action={<Badge>{`버전 ${revision}`}</Badge>} />
      <FieldRow>
        <Field label="누르는 사람 (게이트 기록)">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        {needsImportance && (
          <Field label="중요도 (G1)">
            <Select value={importance} onChange={(e) => setImportance(e.target.value as "major" | "watch")}>
              <option value="major">major — 피드 편성</option>
              <option value="watch">watch — 이번 주의 변수에만</option>
            </Select>
          </Field>
        )}
      </FieldRow>
      {shown.map((a) => (
        <Stack key={a.action} gap={2}>
          <Stack direction="row" justify="between" align="center">
            <Text size="title">{LABEL[a.action]}</Text>
            <Button
              variant={a.gate ? "primary" : "secondary"}
              disabled={pending || a.issues.length > 0 || !name.trim()}
              onClick={() => run(() => gateAction(pieceId, revision, a.action, { actor: name, ...(a.action === "select" && kind !== "research" ? { importance } : {}) }), `${LABEL[a.action]} — 기록됨`)}
            >
              {a.gate ? `${a.gate} 통과` : "진행"}
            </Button>
          </Stack>
          {a.issues.length > 0 && (
            <CheckList>
              {a.issues.map((m) => (
                <Check key={m} ok={false}>{m}</Check>
              ))}
            </CheckList>
          )}
        </Stack>
      ))}
      <Outcome result={result} />
    </Card>
  );
}
