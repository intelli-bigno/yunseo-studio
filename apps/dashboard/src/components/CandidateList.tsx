"use client";
import { useState } from "react";
import type { EventCandidate } from "@yunseo/domain";
import { Badge, Button, Done, Input, List, Stack, Text } from "@yunseo/ui";

const Q_LABEL = { a: "가격 영향", b: "예정 일정", c: "독자 관심", d: "직접 경험", e: "시나리오" } as const;

export function CandidateList({ initial }: { initial: EventCandidate[] }) {
  const [items, setItems] = useState(initial);
  const [reasonFor, setReasonFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const decide = (id: string, d: EventCandidate["decision"]) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, decision: d } : x)));

  return (
    <List>
      {items.map((c) => (
        <Stack key={c.id} gap={2}>
          <Stack direction="row" justify="between" align="center" gap={2}>
            <Text size="title">{c.label}</Text>
            {c.decision === "major" ? <Done>major 확정</Done> : c.decision ? <Badge>{c.decision}</Badge> : <Text size="label" tone="mute" mono>{c.date.slice(5).replace("-", ".")}</Text>}
          </Stack>
          <Stack direction="row" gap={1} wrap>
            {(Object.keys(Q_LABEL) as (keyof typeof Q_LABEL)[])
              .filter((k) => c.questions[k])
              .map((k) => (
                <Badge key={k}>{Q_LABEL[k]}</Badge>
              ))}
          </Stack>
          {reasonFor === c.id ? (
            <Stack direction="row" gap={2}>
              <Input autoFocus placeholder="major 이유" value={reason} onChange={(e) => setReason(e.target.value)} />
              <Button variant="primary" disabled={!reason.trim()} onClick={() => { decide(c.id, "major"); setReasonFor(null); setReason(""); }}>확정</Button>
            </Stack>
          ) : (
            <Stack direction="row" gap={2}>
              <Button onClick={() => setReasonFor(c.id)}>major</Button>
              <Button onClick={() => decide(c.id, "watch")}>watch</Button>
              <Button variant="ghost" onClick={() => decide(c.id, "skip")}>skip</Button>
            </Stack>
          )}
        </Stack>
      ))}
    </List>
  );
}
