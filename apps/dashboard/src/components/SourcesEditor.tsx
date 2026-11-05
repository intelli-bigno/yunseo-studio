"use client";
// 출처·기준 시점 편집기 (G2) — 문장 목록 + 선택 문장 상세. 「확인」은 사람만, 저장된 문장만(도메인이 갖출 것을 다시 본다).
// [L2] 문장 추가·삭제·수정은 「저장」으로 남는다. 바뀐 문장은 확인 표시가 풀린다. URL 은 형식만 본다(열지 않는다).
import { useState } from "react";
import { claimBlockers, type Mark, type Piece, type PieceClaim } from "@yunseo/domain";
import { Badge, Button, Card, CardHeader, Check, CheckList, Checkbox, Done, EmptyState, Field, FieldRow, Glyph, Input, List, ListItem, Metric, Segmented, SegmentedItem, Select, Split, Stack, Text, Textarea, type Media } from "@yunseo/ui";
import { confirmClaimAction, savePieceAction } from "@/app/content/actions";
import { MARK_GLYPH, MARK_LABEL } from "@/lib/labels";
import { Outcome, useServerAction } from "./AuthoringKit";

type Filter = "all" | "open" | "done";

const blank = (id: string): PieceClaim => ({ id, mark: "fact", basis: "research", text: "", publisher: null, url: null, quote: null, accessedAt: null, asOf: null, verified: false, basedOn: [] });
const sameContent = (a: PieceClaim, b: PieceClaim) => JSON.stringify({ ...a, verified: 0, verifiedBy: 0, verifiedAt: 0, basedOn: a.basedOn ?? [] }) === JSON.stringify({ ...b, verified: 0, verifiedBy: 0, verifiedAt: 0, basedOn: b.basedOn ?? [] });

export function SourcesEditor({ piece, revision, actor, art }: { piece: Piece; revision: number; actor: string; art: Media }) {
  const [claims, setClaims] = useState<PieceClaim[]>(piece.claims);
  const [sel, setSel] = useState(0);
  const [filter, setFilter] = useState<Filter>("all");
  const { pending, result, run } = useServerAction();
  const issuesOf = (c: PieceClaim) => [...claimBlockers(c, claims), ...(c.verified ? [] : ["사람 확인 전"])];
  const open = claims.filter((c) => issuesOf(c).length > 0).length;
  const shown = claims.map((c, i) => ({ c, i })).filter(({ c }) => (filter === "all" ? true : filter === "open" ? issuesOf(c).length > 0 : issuesOf(c).length === 0));
  const cur = claims[sel];
  const saved = new Map(piece.claims.map((c) => [c.id, c]));
  const dirty = claims.length !== piece.claims.length || claims.some((c) => !saved.has(c.id) || !sameContent(c, saved.get(c.id)!));
  const set = (patch: Partial<PieceClaim>) => setClaims((xs) => xs.map((c, i) => (i === sel ? { ...c, ...patch, verified: false, verifiedBy: null, verifiedAt: null } : c)));
  const add = () => {
    const n = claims.reduce((m, c) => Math.max(m, Number(c.id.replace(/\D/g, "")) || 0), 0) + 1;
    setClaims((xs) => [...xs, blank(`c${n}`)]);
    setSel(claims.length);
  };
  const editable = piece.kind !== "story";
  const save = () => run(() => savePieceAction(piece.id, revision, { claims }, { actor }));

  if (claims.length === 0)
    return (
      <Card>
        <EmptyState media={art} title="출처 붙일 문장 없음" action={editable ? <Button onClick={add}>문장 추가</Button> : undefined} />
      </Card>
    );

  return (
    <Split
      rail={
        cur && (
          <Card>
            <CardHeader title={`문장 ${cur.id} (${sel + 1} / ${claims.length})`} action={<Button variant="ghost" onClick={() => { setClaims((xs) => xs.filter((_, i) => i !== sel)); setSel(0); }}>삭제</Button>} />
            <FieldRow>
              <Field label="구분">
                <Select value={cur.mark} onChange={(e) => set({ mark: e.target.value as Mark })}>
                  {(Object.keys(MARK_LABEL) as Mark[]).map((m) => (
                    <option key={m} value={m}>{MARK_GLYPH[m]} {MARK_LABEL[m]}</option>
                  ))}
                </Select>
              </Field>
              <Field label="근거">
                <Select value={cur.basis} onChange={(e) => set({ basis: e.target.value as PieceClaim["basis"] })}>
                  <option value="research">조사</option>
                  <option value="experienced">직접 경험</option>
                </Select>
              </Field>
            </FieldRow>
            <Field label="문장 (한 문장에 구분 하나)">
              <Textarea value={cur.text} onChange={(e) => set({ text: e.target.value })} />
            </Field>
            <FieldRow>
              <Field label="발행처">
                <Input value={cur.publisher ?? ""} onChange={(e) => set({ publisher: e.target.value || null })} />
              </Field>
              <Field label="접근일">
                <Input mono type="date" value={cur.accessedAt ?? ""} onChange={(e) => set({ accessedAt: e.target.value || null })} />
              </Field>
            </FieldRow>
            <Field label="출처 URL (형식만 검사)">
              <Input invalid={claimBlockers(cur, claims).some((m) => m.startsWith("출처 URL"))} value={cur.url ?? ""} placeholder="https://" onChange={(e) => set({ url: e.target.value || null })} />
            </Field>
            <Field label="원문 인용 (그대로)">
              <Input value={cur.quote ?? ""} onChange={(e) => set({ quote: e.target.value || null })} />
            </Field>
            <Field label="기준 시점 KST (분 단위)">
              <Input mono invalid={!cur.asOf} type="datetime-local" value={cur.asOf?.slice(0, 16) ?? ""} onChange={(e) => set({ asOf: e.target.value || null })} />
            </Field>
            {cur.mark === "view" && (
              <Field label="근거 사실 (based_on)">
                <List>
                  {claims
                    .filter((c) => c.id !== cur.id && (c.mark === "fact" || c.mark === "reaction"))
                    .map((c) => (
                      <Checkbox
                        key={c.id}
                        lead={c.id}
                        label={c.text || "(빈 문장)"}
                        checked={(cur.basedOn ?? []).includes(c.id)}
                        onChange={(e) => set({ basedOn: e.target.checked ? [...(cur.basedOn ?? []), c.id] : (cur.basedOn ?? []).filter((x) => x !== c.id) })}
                      />
                    ))}
                </List>
              </Field>
            )}
            <CheckList>
              {claimBlockers(cur, claims).map((m) => (
                <Check key={m} ok={false}>{m}</Check>
              ))}
            </CheckList>
            {cur.verified ? (
              <Done key={sel}>원문 대조 확인됨{cur.verifiedBy ? ` · ${cur.verifiedBy}` : ""}</Done>
            ) : (
              <Button
                variant="primary"
                block
                disabled={pending || dirty || piece.status !== "drafted" || claimBlockers(cur, claims).length > 0}
                onClick={() => run(() => confirmClaimAction(piece.id, revision, cur.id, actor), "확인 기록됨")}
              >
                원문 대조 — 확인
              </Button>
            )}
            {!cur.verified && (dirty || piece.status !== "drafted") && <Text size="label" tone="mute">{dirty ? "저장한 뒤 확인할 수 있다" : "작성 단계(drafted)에서만 확인한다"}</Text>}
          </Card>
        )
      }
    >
      <Card>
        <Stack direction="row" justify="between" align="end">
          <Metric value={open} unit={`/ ${claims.length}`} label="남은 확인" tone={open ? "alert" : "accent"} />
          <Segmented label="거르기">
            {(["all", "open", "done"] as Filter[]).map((f) => (
              <SegmentedItem key={f} type="button" current={filter === f} onClick={() => setFilter(f)}>
                {f === "all" ? "전체" : f === "open" ? "미확인" : "확인됨"}
              </SegmentedItem>
            ))}
          </Segmented>
        </Stack>
        <List>
          {shown.map(({ c, i }) => {
            const issues = issuesOf(c);
            return (
              <ListItem
                key={c.id}
                as="button"
                type="button"
                current={i === sel}
                onClick={() => setSel(i)}
                leading={<Glyph title={MARK_LABEL[c.mark]}>{MARK_GLYPH[c.mark]}</Glyph>}
                title={c.text || "(빈 문장)"}
                meta={`${c.id} · ${c.basis === "experienced" ? "직접 경험" : (c.publisher ?? "출처 없음")} · ${c.asOf ? c.asOf.replace("T", " ") : "—"}`}
                trailing={issues.length ? <Badge tone="alert">{issues[0]}{issues.length > 1 ? ` +${issues.length - 1}` : ""}</Badge> : <Badge tone="accent">확인됨</Badge>}
              />
            );
          })}
        </List>
        <Stack direction="row" justify="between" align="center">
          {result ? <Outcome result={result} /> : <Text size="label" tone="mute">{dirty ? "저장 안 한 변경 있음" : "저장된 상태"}</Text>}
          <Stack direction="row" gap={2}>
            <Button onClick={add}>문장 추가</Button>
            <Button variant="primary" disabled={!dirty || pending} onClick={save}>{pending ? "저장 중" : "저장"}</Button>
          </Stack>
        </Stack>
      </Card>
    </Split>
  );
}
