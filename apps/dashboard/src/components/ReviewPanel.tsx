"use client";
// 검수 (G3) — 전 항목 체크 뒤 승인, 반려는 사유 필수. [L2] 판단은 서버(도메인 규칙)가 다시 한다 — 승인은 지금 내용 해시를 기록하고, 내용이 바뀌면 무효.
import { useState } from "react";
import type { Approval, Piece } from "@yunseo/domain";
import { Badge, Button, Card, CardHeader, Checkbox, Done, Input, List, Metric, Notice, Split, Stack, Text } from "@yunseo/ui";
import { gateAction } from "@/app/content/actions";
import { Outcome, useServerAction } from "./AuthoringKit";

export interface ReviewProps {
  piece: Piece;
  revision: number;
  actor: string;
  checklist: string[];
  contentHash: string;
  g3: { last: Approval | null; valid: boolean };
  /** 이후 편이면 나란히 볼 이전 편 */
  preIssue: Piece | null;
}

export function ReviewPanel({ piece, revision, actor, checklist, contentHash, g3, preIssue }: ReviewProps) {
  const [checked, setChecked] = useState<boolean[]>(() => checklist.map(() => false));
  const [reason, setReason] = useState("");
  const [name, setName] = useState(actor);
  const { pending, result, run } = useServerAction();
  const canApprove = piece.status === "in_review";
  const canReapprove = piece.status === "published" && !g3.valid;
  const open = canApprove || canReapprove;
  const all = checked.every(Boolean);

  return (
    <Split
      rail={
        <Card>
          <CardHeader title="G3 발행 판단" />
          <Metric size="hero" value={checked.filter(Boolean).length} unit={`/ ${checklist.length}`} label="확인" />
          {g3.last && (
            <Stack gap={1}>
              {g3.last.decision === "approved" ? (g3.valid ? <Done>승인됨 · {g3.last.actor}</Done> : <Badge tone="alert">승인 뒤 내용 변경 — 무효</Badge>) : <Badge tone="alert">반려 · {g3.last.actor}</Badge>}
              <Text size="label" tone="mute" mono>승인 해시 {g3.last.contentHash.slice(0, 12)} · {g3.last.at.replace("T", " ")}</Text>
              {g3.last.note && <Text tone="dim">{g3.last.note}</Text>}
            </Stack>
          )}
          <Text size="label" tone="mute" mono>지금 내용 해시 {contentHash.slice(0, 12)}</Text>
          {open ? (
            <>
              <Input placeholder="확인자" value={name} onChange={(e) => setName(e.target.value)} />
              <Button variant="primary" block disabled={!all || pending || !name.trim()} onClick={() => run(() => gateAction(piece.id, revision, canApprove ? "approve" : "reapprove", { actor: name, checklist: checked }), "승인 기록됨")}>
                {canApprove ? "승인" : "다시 승인"}
              </Button>
              {canApprove && (
                <>
                  <Input placeholder="반려 사유 (필수)" value={reason} onChange={(e) => setReason(e.target.value)} />
                  <Button block disabled={!reason.trim() || pending || !name.trim()} onClick={() => run(() => gateAction(piece.id, revision, "reject", { actor: name, reason }), "반려 기록됨 — 작성 단계로")}>
                    반려
                  </Button>
                </>
              )}
            </>
          ) : (
            <Text size="label" tone="mute">{piece.status === "approved" ? "승인본 — 발행 대기열·업로드 묶음으로" : "검수 중(in_review)일 때 판단한다"}</Text>
          )}
          <Outcome result={result} />
        </Card>
      }
    >
      <Card>
        {!open && <Notice tone="accent">지금 상태 {piece.status} — 체크리스트는 검수 중일 때만 누른다</Notice>}
        <List>
          {checklist.map((label, n) => (
            <Checkbox
              key={label}
              lead={String(n + 1).padStart(2, "0")}
              label={label}
              disabled={!open}
              checked={checked[n] ?? false}
              onChange={(e) => setChecked((xs) => xs.map((x, k) => (k === n ? e.target.checked : x)))}
            />
          ))}
        </List>
      </Card>
      {preIssue && (
        <Card>
          <CardHeader title={`이전 편 ${preIssue.id} — 나란히 읽기`} />
          <Text tone="dim">{preIssue.viewpoint}</Text>
          <List>
            {(preIssue.scenarios ?? []).map((s) => {
              const o = piece.scenarioOutcomes?.find((x) => x.scenarioId === s.id);
              return (
                <Stack key={s.id} direction="row" justify="between" align="center">
                  <Text>{s.id} · {s.label} — {s.condition}</Text>
                  <Badge tone={o ? "neutral" : "alert"}>{o ? o.outcome : "미응답"}</Badge>
                </Stack>
              );
            })}
          </List>
        </Card>
      )}
    </Split>
  );
}
