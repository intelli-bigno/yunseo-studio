"use client";
// 작성 — 단 목록 · 가운데 쓰기 · 오른쪽 점검. 종류마다 단만 바뀐다. [L2] 자동 저장 아님: 「저장」을 눌러야 SQLite 에 남는다(읽은 버전으로 낙관적 동시성).
import { useState } from "react";
import { KIND_FIELDS, type CheckItem, type ChangeKind, type FieldSpec, type Piece, type ScenarioItem } from "@yunseo/domain";
import { Badge, Button, Card, CardHeader, Check, CheckList, EmptyState, Field, FieldRow, Glyph, Input, List, ListItem, Metric, Notice, Select, Split, Stack, Text, Textarea, type Media } from "@yunseo/ui";
import { savePieceAction } from "@/app/content/actions";
import { Outcome, useServerAction } from "./AuthoringKit";

export interface ComposeProps {
  piece: Piece;
  revision: number;
  actor: string;
  /** G2 를 막는 이유(저장된 내용 기준) */
  blockers: string[];
  /** 이후 편이 고를 수 있는 이전 편 */
  preIssueOptions: { id: string; title: string }[];
  art: Media;
}

const LIMIT = 220; // 본문 카드 글자 상한(가정값 — 프리셋 limits_provisional)
const nextId = (prefix: string, ids: string[]) => `${prefix}${ids.reduce((m, id) => Math.max(m, Number(id.replace(/\D/g, "")) || 0), 0) + 1}`;
const CHANGE_LABEL: Record<ChangeKind, string> = { correction: "정정(사실 오류)", update: "갱신(판단이 바뀜)", clarification: "명확화(표현만)" };

/** [L7] 구조 칸 하나 — 정본 스키마(01 §4) 필드 중 단 본문으로 못 채우는 것 */
function StructField({ spec, value, onChange }: { spec: FieldSpec; value: string; onChange: (v: string) => void }) {
  const label = spec.hint ? `${spec.label} — ${spec.hint}` : spec.label;
  if (spec.type === "select")
    return (
      <Field label={label}>
        <Select value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">고르기</option>
          {spec.options?.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Select>
      </Field>
    );
  if (spec.type === "text")
    return (
      <Field label={label}>
        <Input value={value} onChange={(e) => onChange(e.target.value)} />
      </Field>
    );
  return (
    <Field label={label}>
      <Textarea value={value} placeholder={spec.hint ?? ""} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

export function ComposeEditor({ piece, revision, actor, blockers, preIssueOptions, art }: ComposeProps) {
  const [title, setTitle] = useState(piece.title);
  const [slot, setSlot] = useState(piece.slot.slice(0, 16));
  const [viewpoint, setViewpoint] = useState(piece.viewpoint);
  const [pre, setPre] = useState(piece.preIssueId ?? "");
  const [stages, setStages] = useState(piece.stages);
  const [scenarios, setScenarios] = useState<ScenarioItem[]>(piece.scenarios ?? []);
  const [checks, setChecks] = useState<CheckItem[]>(piece.checks ?? []);
  const [fields, setFields] = useState<Record<string, string>>(piece.fields ?? {});
  const [changeKind, setChangeKind] = useState<ChangeKind | "">("");
  const [reason, setReason] = useState("");
  const [readerNote, setReaderNote] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [i, setI] = useState(0);
  const { pending, result, run } = useServerAction();
  const cur = stages[i];
  const published = piece.status === "published";
  const reviewed = piece.status === "verified" || piece.status === "in_review" || piece.status === "approved";

  if (piece.kind === "story" || !cur) return <Card><EmptyState media={art} title="스토리 편은 여기서 쓰지 않음" /></Card>;

  // [L7] 구조 칸 — 편 머리(모든 단 공통)와 지금 단의 칸. 연구 편은 고른 연구 단계의 칸만
  const specs = KIND_FIELDS[piece.kind];
  const researchStage = fields["stage"] || "idea";
  const headFields = specs.filter((f) => f.stage === null);
  const stageFields = specs.filter((f) => f.stage === cur.key && (!f.researchStage || f.researchStage === researchStage));
  const setField = (key: string, value: string) =>
    setFields((xs) => {
      const next = { ...xs };
      if (value) next[key] = value;
      else delete next[key];
      return next;
    });

  const dirty =
    title !== piece.title ||
    slot !== piece.slot.slice(0, 16) ||
    viewpoint !== piece.viewpoint ||
    pre !== (piece.preIssueId ?? "") ||
    JSON.stringify(stages) !== JSON.stringify(piece.stages) ||
    JSON.stringify(scenarios) !== JSON.stringify(piece.scenarios ?? []) ||
    JSON.stringify(checks) !== JSON.stringify(piece.checks ?? []) ||
    JSON.stringify(fields) !== JSON.stringify(piece.fields ?? {});
  const empty = stages.filter((s) => !s.body.trim()).length;

  const save = () =>
    run(() =>
      savePieceAction(
        piece.id,
        revision,
        {
          title,
          slot,
          viewpoint,
          stages: stages.map((s) => ({ key: s.key, body: s.body })),
          fields,
          ...(piece.kind === "pre" ? { scenarios, checks } : {}),
          ...(piece.kind === "post" ? { preIssueId: pre || null } : {}),
        },
        { actor, ...(reason ? { reason } : {}), ...(changeKind ? { changeKind } : {}), ...(readerNote ? { readerNote } : {}), ...(followUp ? { followUp } : {}) },
      ),
    );

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
            <CardHeader title="G2 점검 (저장된 내용)" />
            <CheckList>
              <Check ok={empty === 0 || piece.kind === "research"}>{empty === 0 ? "모든 단 채움" : `빈 단 ${empty}`}</Check>
              {blockers.length === 0 ? <Check ok>사실 확인으로 보낼 수 있음</Check> : blockers.map((b) => <Check key={b} ok={false}>{b}</Check>)}
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
        <CardHeader title="편" action={<Badge>{`버전 ${revision}`}</Badge>} />
        <FieldRow>
          <Field label="제목">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="게시 예정 KST">
            <Input mono type="datetime-local" value={slot} onChange={(e) => setSlot(e.target.value)} />
          </Field>
        </FieldRow>
        {headFields.map((spec) => (
          <StructField key={spec.key} spec={spec} value={fields[spec.key] ?? ""} onChange={(v) => setField(spec.key, v)} />
        ))}
        <Field label="핵심 관점 한 문장 (운영자 해석)">
          <Textarea invalid={!viewpoint.trim()} value={viewpoint} onChange={(e) => setViewpoint(e.target.value)} />
        </Field>
        {piece.kind === "post" && (
          <Field label="이전 편 (이 편이 닫는 사전 시나리오)">
            <Select value={pre} onChange={(e) => setPre(e.target.value)}>
              <option value="">사전 시나리오 없음</option>
              {preIssueOptions.map((o) => (
                <option key={o.id} value={o.id}>{o.id} · {o.title}</option>
              ))}
            </Select>
          </Field>
        )}
      </Card>

      <Card>
        <Stack direction="row" justify="between" align="end">
          <Stack gap={1}>
            <Text size="label" tone="mute">{i + 1}단</Text>
            <Text as="h2" size="heading">{cur.title}</Text>
            <Text tone="dim">{cur.question}</Text>
          </Stack>
          <Metric value={cur.body.length} unit={`/ ${LIMIT}`} label="글자" tone={cur.body.length > LIMIT ? "alert" : "default"} />
        </Stack>
        <Textarea tall value={cur.body} placeholder="첫 줄 = 카드 제목, 다음 줄부터 점" onChange={(e) => setStages((xs) => xs.map((s, n) => (n === i ? { ...s, body: e.target.value } : s)))} />
        {stageFields.map((spec) => (
          <StructField key={spec.key} spec={spec} value={fields[spec.key] ?? ""} onChange={(v) => setField(spec.key, v)} />
        ))}
        {piece.kind === "research" && researchStage !== cur.key && <Text size="label" tone="mute">이 편의 연구 단계는 「{researchStage}」 — 이 단은 카드에 들어가지 않는다</Text>}
        <Stack direction="row" gap={2} justify="end">
          <Button disabled={i === 0} onClick={() => setI(i - 1)}>이전</Button>
          <Button disabled={i === stages.length - 1} onClick={() => setI(i + 1)}>다음</Button>
        </Stack>
      </Card>

      {piece.kind === "pre" && (
        <Card>
          <CardHeader title="시나리오 (둘 이상 — 이후 편이 이 id 로 응답)" action={<Button onClick={() => setScenarios((xs) => [...xs, { id: nextId("s", xs.map((x) => x.id)), label: "", condition: "", reading: "" }])}>추가</Button>} />
          {scenarios.map((s, n) => (
            <FieldRow key={s.id}>
              <Field label={`${s.id} 이름`}>
                <Input value={s.label} onChange={(e) => setScenarios((xs) => xs.map((x, k) => (k === n ? { ...x, label: e.target.value } : x)))} />
              </Field>
              <Field label="조건">
                <Input value={s.condition} onChange={(e) => setScenarios((xs) => xs.map((x, k) => (k === n ? { ...x, condition: e.target.value } : x)))} />
              </Field>
              <Field label="읽는 법">
                <Input value={s.reading} onChange={(e) => setScenarios((xs) => xs.map((x, k) => (k === n ? { ...x, reading: e.target.value } : x)))} />
              </Field>
              <Button variant="ghost" onClick={() => setScenarios((xs) => xs.filter((_, k) => k !== n))}>삭제</Button>
            </FieldRow>
          ))}
          <CardHeader title="발표 뒤 확인할 것" action={<Button onClick={() => setChecks((xs) => [...xs, { id: nextId("k", xs.map((x) => x.id)), what: "", where: "" }])}>추가</Button>} />
          {checks.map((c, n) => (
            <FieldRow key={c.id}>
              <Field label={`${c.id} 무엇`}>
                <Input value={c.what} onChange={(e) => setChecks((xs) => xs.map((x, k) => (k === n ? { ...x, what: e.target.value } : x)))} />
              </Field>
              <Field label="볼 곳">
                <Input value={c.where} onChange={(e) => setChecks((xs) => xs.map((x, k) => (k === n ? { ...x, where: e.target.value } : x)))} />
              </Field>
              <Button variant="ghost" onClick={() => setChecks((xs) => xs.filter((_, k) => k !== n))}>삭제</Button>
            </FieldRow>
          ))}
        </Card>
      )}

      <Card>
        {published && (
          <>
            <Notice>발행된 편 — 바꾸면 G3 승인이 풀린다</Notice>
            <FieldRow>
              <Field label="변경 종류">
                <Select value={changeKind} onChange={(e) => setChangeKind(e.target.value as ChangeKind | "")}>
                  <option value="">고르기</option>
                  {(Object.keys(CHANGE_LABEL) as ChangeKind[]).map((k) => (
                    <option key={k} value={k}>{CHANGE_LABEL[k]}</option>
                  ))}
                </Select>
              </Field>
              <Field label="후속 게시물 id 또는 기한 (갱신)">
                <Input value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
              </Field>
            </FieldRow>
            <Field label="수정 이유 (필수)">
              <Input value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
            <Field label="독자에게 보일 정정 문구 (정정·갱신)">
              <Input value={readerNote} onChange={(e) => setReaderNote(e.target.value)} />
            </Field>
          </>
        )}
        {reviewed && dirty && <Notice>저장하면 G2·G3 가 풀린다</Notice>}
        {!published && (
          <Field label="저장 메모 (선택)">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        )}
        <Stack direction="row" justify="between" align="center">
          {result ? <Outcome result={result} /> : <Text size="label" tone="mute">{dirty ? "저장 안 한 변경 있음" : "저장된 상태"}</Text>}
          <Button variant="primary" disabled={!dirty || pending} onClick={save}>{pending ? "저장 중" : "저장"}</Button>
        </Stack>
      </Card>
    </Split>
  );
}
