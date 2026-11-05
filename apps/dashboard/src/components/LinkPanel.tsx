"use client";
// [L2] 이전 ↔ 이후 연결 보기(06 §4) — 왼쪽 이전 편(읽기 전용), 오른쪽 이후 편의 응답. 시나리오 전부·확인할 것 전부를 닫아야 G2 를 넘는다.
// 응답은 이전 편의 안정 id(scenario_id·check_id)로만 저장된다 — 없는 id 는 서버(도메인)가 거절한다.
import Link from "next/link";
import { useState } from "react";
import { CHECK_RESULT_STATUSES, SCENARIO_OUTCOMES, type CheckResult, type CheckResultStatus, type EvidenceReady, type Piece, type ScenarioOutcome, type ScenarioOutcomeKind } from "@yunseo/domain";
import { Badge, Button, Card, CardHeader, Checkbox, EmptyState, Field, FieldRow, Input, List, ListItem, Metric, Notice, Select, Split, Stack, Text, TextLink, type Media } from "@yunseo/ui";
import { savePieceAction } from "@/app/content/actions";
import { Outcome, useServerAction } from "./AuthoringKit";

const OUTCOME_LABEL: Record<ScenarioOutcomeKind, string> = { matched: "맞음", partial: "일부", diverged: "어긋남", unresolved: "판정 보류" };
const CHECK_LABEL: Record<CheckResultStatus, string> = { done: "확인함", not_available: "자료 없음", dropped: "버림(이유 필수)" };
const EVIDENCE: [keyof EvidenceReady, string][] = [
  ["primary", "결과의 1차 자료가 공개됐고 확인했다"],
  ["observed", "시장 반응을 읽을 만큼 관측 시간이 지났다"],
  ["allScenarios", "이전 편 시나리오 전부에 대응이 적혀 있다"],
  ["separated", "사실 / 시장 반응 / 해석이 섞이지 않았다"],
];

export interface LinkProps {
  piece: Piece;
  revision: number;
  actor: string;
  preIssue: Piece | null;
  linkedPosts: Piece[];
  art: Media;
}

export function LinkPanel({ piece, revision, actor, preIssue, linkedPosts, art }: LinkProps) {
  const [outcomes, setOutcomes] = useState<ScenarioOutcome[]>(piece.scenarioOutcomes ?? []);
  const [results, setResults] = useState<CheckResult[]>(piece.checkResults ?? []);
  const [evidence, setEvidence] = useState<EvidenceReady>(piece.evidence ?? { primary: false, observed: false, allScenarios: false, separated: false });
  const { pending, result, run } = useServerAction();

  if (piece.kind === "pre") {
    return (
      <Card>
        <CardHeader title="이 편을 닫는 이후 편" />
        {linkedPosts.length === 0 ? (
          <EmptyState media={art} title="아직 이 편을 가리키는 이후 편이 없음" action={<TextLink as={Link} href="/content/new?kind=post">이후 편 만들기</TextLink>} />
        ) : (
          <List>
            {linkedPosts.map((p) => {
              const answered = (p.scenarioOutcomes ?? []).length;
              return (
                <ListItem key={p.id} as={Link} href={`/content/${p.id}?tab=link`} title={`${p.id} · ${p.title}`} meta={p.status} trailing={<Badge tone={answered >= (piece.scenarios ?? []).length ? "accent" : "alert"}>{`응답 ${answered}/${(piece.scenarios ?? []).length}`}</Badge>} />
              );
            })}
          </List>
        )}
      </Card>
    );
  }
  if (piece.kind !== "post") return <Card><EmptyState media={art} title="연결은 이전·이후 편만 — 연구 편은 스레드로 이어진다" /></Card>;

  const scenarios = preIssue?.scenarios ?? [];
  const checks = preIssue?.checks ?? [];
  const closed = scenarios.filter((s) => outcomes.some((o) => o.scenarioId === s.id)).length + checks.filter((c) => results.some((r) => r.checkId === c.id)).length;
  const total = scenarios.length + checks.length;
  const dirty = JSON.stringify(outcomes) !== JSON.stringify(piece.scenarioOutcomes ?? []) || JSON.stringify(results) !== JSON.stringify(piece.checkResults ?? []) || JSON.stringify(evidence) !== JSON.stringify(piece.evidence ?? { primary: false, observed: false, allScenarios: false, separated: false });
  const setOutcome = (id: string, patch: Partial<ScenarioOutcome>) =>
    setOutcomes((xs) => (xs.some((o) => o.scenarioId === id) ? xs.map((o) => (o.scenarioId === id ? { ...o, ...patch } : o)) : [...xs, { scenarioId: id, outcome: "unresolved", note: "", ...patch }]));
  const setResult = (id: string, patch: Partial<CheckResult>) =>
    setResults((xs) => (xs.some((r) => r.checkId === id) ? xs.map((r) => (r.checkId === id ? { ...r, ...patch } : r)) : [...xs, { checkId: id, status: "done", note: "", ...patch }]));
  const save = () => run(() => savePieceAction(piece.id, revision, { scenarioOutcomes: outcomes, checkResults: results, evidence }, { actor }));

  return (
    <Split
      rail={
        <Card>
          <CardHeader title="자료 확보 조건 (사람 판단)" />
          {EVIDENCE.map(([k, label]) => (
            <Checkbox key={k} label={label} checked={evidence[k]} onChange={(e) => setEvidence((x) => ({ ...x, [k]: e.target.checked }))} />
          ))}
          <Metric value={closed} unit={`/ ${total}`} label="닫힘" tone={closed === total ? "accent" : "alert"} />
          <Stack direction="row" justify="between" align="center">
            {result ? <Outcome result={result} /> : <Text size="label" tone="mute">{dirty ? "저장 안 한 변경 있음" : "저장된 상태"}</Text>}
            <Button variant="primary" disabled={!dirty || pending} onClick={save}>{pending ? "저장 중" : "저장"}</Button>
          </Stack>
        </Card>
      }
    >
      {!preIssue ? (
        <Notice tone="accent">사전 시나리오 없음 — 소급해서 만든 것처럼 쓰지 않는다. 이전 편을 가리키려면 작성 탭에서 고른다</Notice>
      ) : (
        <>
          <Card>
            <CardHeader title={<TextLink as={Link} href={`/content/${preIssue.id}?tab=link`}>{`이전 편 ${preIssue.id} · ${preIssue.title}`}</TextLink>} />
            <Text tone="dim">{preIssue.viewpoint}</Text>
          </Card>
          <Card>
            <CardHeader title="시나리오 응답" />
            {scenarios.length === 0 && <Text tone="mute">이전 편에 시나리오가 없음</Text>}
            {scenarios.map((s) => {
              const o = outcomes.find((x) => x.scenarioId === s.id);
              return (
                <FieldRow key={s.id}>
                  <Field label={`${s.id} · ${s.label}`}>
                    <Text tone="dim">{s.condition} → {s.reading}</Text>
                  </Field>
                  <Field label="결과">
                    <Select value={o?.outcome ?? ""} onChange={(e) => (e.target.value ? setOutcome(s.id, { outcome: e.target.value as ScenarioOutcomeKind }) : setOutcomes((xs) => xs.filter((x) => x.scenarioId !== s.id)))}>
                      <option value="">미응답</option>
                      {SCENARIO_OUTCOMES.map((k) => (
                        <option key={k} value={k}>{OUTCOME_LABEL[k]}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="메모">
                    <Input value={o?.note ?? ""} disabled={!o} onChange={(e) => setOutcome(s.id, { note: e.target.value })} />
                  </Field>
                </FieldRow>
              );
            })}
          </Card>
          <Card>
            <CardHeader title="「확인할 것」 처리" />
            {checks.map((c) => {
              const r = results.find((x) => x.checkId === c.id);
              return (
                <FieldRow key={c.id}>
                  <Field label={`${c.id} · ${c.what}`}>
                    <Text tone="dim">{c.where}</Text>
                  </Field>
                  <Field label="처리">
                    <Select value={r?.status ?? ""} onChange={(e) => (e.target.value ? setResult(c.id, { status: e.target.value as CheckResultStatus }) : setResults((xs) => xs.filter((x) => x.checkId !== c.id)))}>
                      <option value="">미처리</option>
                      {CHECK_RESULT_STATUSES.map((k) => (
                        <option key={k} value={k}>{CHECK_LABEL[k]}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="메모">
                    <Input invalid={r?.status === "dropped" && !r.note.trim()} value={r?.note ?? ""} disabled={!r} onChange={(e) => setResult(c.id, { note: e.target.value })} />
                  </Field>
                </FieldRow>
              );
            })}
          </Card>
        </>
      )}
    </Split>
  );
}
