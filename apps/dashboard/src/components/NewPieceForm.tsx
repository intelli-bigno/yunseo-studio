"use client";
// [L2] 새 편 — 3종(이전·이후·연구) 중 하나. 만들면 상태 idea(G1 대기)로 시작하고 작성 탭으로 간다.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { AuthoringKind } from "@yunseo/domain";
import { Button, Card, Field, FieldRow, Input, Segmented, SegmentedItem, Select, Stack, Textarea } from "@yunseo/ui";
import { createPieceChecked } from "@/app/content/actions";
import { KIND_LABEL } from "@/lib/labels";
import { Outcome, type ActionOutcome } from "./AuthoringKit";

const KINDS: AuthoringKind[] = ["pre", "post", "research"];

export function NewPieceForm({ preIssueOptions, initialKind, actor }: { preIssueOptions: { id: string; title: string }[]; initialKind: AuthoringKind; actor: string }) {
  const router = useRouter();
  const [kind, setKind] = useState<AuthoringKind>(initialKind);
  const [title, setTitle] = useState("");
  const [slot, setSlot] = useState("");
  const [viewpoint, setViewpoint] = useState("");
  const [pre, setPre] = useState("");
  const [name, setName] = useState(actor);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ outcome: ActionOutcome; n: number } | null>(null);
  const submit = () =>
    start(async () => {
      const r = await createPieceChecked({ kind, title, slot, viewpoint, preIssueId: kind === "post" && pre ? pre : null, actor: name });
      setResult((x) => ({ outcome: r, n: (x?.n ?? 0) + 1 }));
      if (r.ok) router.push(`/content/${r.id}?tab=write`);
    });

  return (
    <Card>
      <Segmented label="종류">
        {KINDS.map((k) => (
          <SegmentedItem key={k} type="button" current={kind === k} onClick={() => setKind(k)}>
            {KIND_LABEL[k]}
          </SegmentedItem>
        ))}
      </Segmented>
      <FieldRow>
        <Field label="제목">
          <Input value={title} invalid={!title.trim()} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="게시 예정 KST">
          <Input mono type="datetime-local" value={slot} invalid={!slot} onChange={(e) => setSlot(e.target.value)} />
        </Field>
      </FieldRow>
      <Field label="핵심 관점 한 문장 (G1 에 필요 — 나중에 써도 된다)">
        <Textarea value={viewpoint} onChange={(e) => setViewpoint(e.target.value)} />
      </Field>
      {kind === "post" && (
        <Field label="이전 편 (사전 시나리오)">
          <Select value={pre} onChange={(e) => setPre(e.target.value)}>
            <option value="">사전 시나리오 없음</option>
            {preIssueOptions.map((o) => (
              <option key={o.id} value={o.id}>{o.id} · {o.title}</option>
            ))}
          </Select>
        </Field>
      )}
      <Field label="만든 사람">
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Stack direction="row" justify="between" align="center">
        <Outcome result={result} />
        <Button variant="primary" disabled={pending || !title.trim() || !slot} onClick={submit}>{pending ? "만드는 중" : "만들기"}</Button>
      </Stack>
    </Card>
  );
}
