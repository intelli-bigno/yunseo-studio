"use client";
import { useState, useTransition } from "react";
import { IMPORTANCE_ANSWER_LABEL, eventDecisionIssues, judgeEventImportance, type EventCandidate, type EventImportance } from "@yunseo/domain";
import { Badge, Button, Done, Input, List, Notice, Stack, Text } from "@yunseo/ui";

/** 서버 액션이 돌려주는 결과 — 화면은 성공 여부와 사유만 본다 */
export interface DecideResult {
  ok: boolean;
  errors: string[];
}

export interface CandidateActions {
  decide: (eventId: string, decision: EventImportance, reason: string) => Promise<DecideResult>;
  clear: (eventId: string) => Promise<DecideResult>;
}

/** 점검표 a~e — 02 §3.2 의 질문 이름. 예인 것만 배지로 보여 준다 */
const Q_KEYS = Object.keys(IMPORTANCE_ANSWER_LABEL) as (keyof typeof IMPORTANCE_ANSWER_LABEL)[];

export function CandidateList({ initial, actions }: { initial: EventCandidate[]; actions?: CandidateActions }) {
  const [items, setItems] = useState(initial);
  const [pending, setPending] = useState<{ id: string; target: EventImportance } | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const apply = (id: string, decision: EventImportance | null) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, decision } : x)));

  const run = (id: string, decision: EventImportance, why: string) => {
    const before = items.find((x) => x.id === id)?.decision ?? null;
    setError(null);
    apply(id, decision); // 먼저 보여 주고, 서버가 거절하면 되돌린다
    startTransition(async () => {
      const res = actions ? await actions.decide(id, decision, why) : { ok: true, errors: [] };
      if (!res.ok) {
        apply(id, before);
        setError(res.errors.join(" · "));
      }
    });
  };

  const choose = (c: EventCandidate, target: EventImportance) => {
    // 판정을 올릴 때는 사유가 필요하다(02 §3.2) — 도메인 규칙을 그대로 쓴다
    const needsReason = eventDecisionIssues({ suggested: judgeEventImportance(c.questions), decision: target, reason: "" }).length > 0;
    if (needsReason) {
      setPending({ id: c.id, target });
      setReason("");
    } else {
      run(c.id, target, "");
    }
  };

  const revert = (id: string) => {
    const before = items.find((x) => x.id === id)?.decision ?? null;
    setError(null);
    apply(id, null);
    startTransition(async () => {
      const res = actions ? await actions.clear(id) : { ok: true, errors: [] };
      if (!res.ok) {
        apply(id, before);
        setError(res.errors.join(" · "));
      }
    });
  };

  return (
    <List>
      {error && <Notice>{error}</Notice>}
      {items.length === 0 && <Text tone="mute">앞으로 3주 안에 후보가 없다</Text>}
      {items.map((c) => {
        const suggested = judgeEventImportance(c.questions);
        return (
          <Stack key={c.id} gap={2}>
            <Stack direction="row" justify="between" align="center" gap={2}>
              <Text size="title">{c.label}</Text>
              {c.decision === "major" ? <Done>major 확정</Done> : c.decision ? <Badge>{c.decision}</Badge> : <Text size="label" tone="mute" mono>{c.date.slice(5).replace("-", ".")}</Text>}
            </Stack>
            <Stack direction="row" gap={1} wrap>
              {Q_KEYS.filter((k) => c.questions[k]).map((k) => (
                <Badge key={k}>{IMPORTANCE_ANSWER_LABEL[k]}</Badge>
              ))}
              {!c.decision && <Text size="label" tone="mute">자동 제안 {suggested}</Text>}
            </Stack>
            {pending?.id === c.id ? (
              <Stack direction="row" gap={2}>
                <Input autoFocus placeholder={`${pending.target} 로 올리는 이유`} value={reason} onChange={(e) => setReason(e.target.value)} />
                <Button
                  variant="primary"
                  disabled={!reason.trim() || busy}
                  onClick={() => {
                    run(c.id, pending.target, reason);
                    setPending(null);
                    setReason("");
                  }}
                >
                  확정
                </Button>
                <Button variant="ghost" onClick={() => setPending(null)}>취소</Button>
              </Stack>
            ) : (
              <Stack direction="row" gap={2}>
                <Button disabled={busy} onClick={() => choose(c, "major")}>major</Button>
                <Button disabled={busy} onClick={() => choose(c, "watch")}>watch</Button>
                <Button variant="ghost" disabled={busy} onClick={() => choose(c, "skip")}>제외</Button>
                {c.decision && <Button variant="ghost" disabled={busy} onClick={() => revert(c.id)}>되돌리기</Button>}
              </Stack>
            )}
          </Stack>
        );
      })}
    </List>
  );
}
