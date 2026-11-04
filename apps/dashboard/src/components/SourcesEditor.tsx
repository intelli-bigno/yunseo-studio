"use client";
import { useMemo, useState } from "react";
import { claimIssues, type Mark, type Piece, type PieceClaim } from "@yunseo/domain";
import { Badge, Button, Card, CardHeader, Check, CheckList, EmptyState, Field, FieldRow, Glyph, Input, List, ListItem, Metric, Segmented, SegmentedItem, Select, Split, Stack, Textarea, type Media } from "@yunseo/ui";
import { MARK_GLYPH, MARK_LABEL } from "@/lib/labels";

// 출처·기준 시점 편집기 (G2) — 문장 목록 + 선택 문장 상세. 「확인」은 사람만.
type Filter = "all" | "open" | "done";

export function SourcesEditor({ piece, art }: { piece: Piece; art: Media }) {
  const [claims, setClaims] = useState<PieceClaim[]>(piece.claims);
  const [sel, setSel] = useState(0);
  const [filter, setFilter] = useState<Filter>("all");
  const open = claims.filter((c) => claimIssues(c).length > 0).length;
  const shown = useMemo(
    () => claims.map((c, i) => ({ c, i })).filter(({ c }) => (filter === "all" ? true : filter === "open" ? claimIssues(c).length > 0 : claimIssues(c).length === 0)),
    [claims, filter],
  );
  const cur = claims[sel];
  const set = (patch: Partial<PieceClaim>) => setClaims((xs) => xs.map((c, i) => (i === sel ? { ...c, ...patch, verified: patch.verified ?? false } : c)));

  if (claims.length === 0) return <Card><EmptyState media={art} title="출처 붙일 문장 없음" /></Card>;

  return (
    <Split
      rail={
        cur && (
          <Card>
            <CardHeader title={`문장 ${sel + 1} / ${claims.length}`} />
            <Field label="구분">
              <Select value={cur.mark} onChange={(e) => set({ mark: e.target.value as Mark })}>
                {(Object.keys(MARK_LABEL) as Mark[]).map((m) => (
                  <option key={m} value={m}>{MARK_GLYPH[m]} {MARK_LABEL[m]}</option>
                ))}
              </Select>
            </Field>
            <Field label="문장">
              <Textarea value={cur.text} onChange={(e) => set({ text: e.target.value })} />
            </Field>
            <FieldRow>
              <Field label="발행처">
                <Input value={cur.publisher ?? ""} onChange={(e) => set({ publisher: e.target.value || null })} />
              </Field>
              <Field label="근거">
                <Select value={cur.basis} onChange={(e) => set({ basis: e.target.value as PieceClaim["basis"] })}>
                  <option value="research">조사</option>
                  <option value="experienced">직접 경험</option>
                </Select>
              </Field>
            </FieldRow>
            <Field label="출처 URL">
              <Input invalid={!cur.url && cur.mark !== "view" && cur.mark !== "scenario"} value={cur.url ?? ""} placeholder="https://" onChange={(e) => set({ url: e.target.value || null })} />
            </Field>
            <Field label="원문 인용">
              <Input value={cur.quote ?? ""} onChange={(e) => set({ quote: e.target.value || null })} />
            </Field>
            <FieldRow>
              <Field label="접근일">
                <Input mono type="date" value={cur.accessedAt ?? ""} onChange={(e) => set({ accessedAt: e.target.value || null })} />
              </Field>
              <Field label="기준 시점 KST">
                <Input mono invalid={!cur.asOf} type="datetime-local" value={cur.asOf ?? ""} onChange={(e) => set({ asOf: e.target.value || null })} />
              </Field>
            </FieldRow>
            <CheckList>
              {claimIssues(cur).map((m) => (
                <Check key={m} ok={false}>{m}</Check>
              ))}
            </CheckList>
            <Button
              variant="primary"
              block
              disabled={claimIssues({ ...cur, verified: true }).length > 0 || cur.verified}
              onClick={() => setClaims((xs) => xs.map((c, i) => (i === sel ? { ...c, verified: true } : c)))}
            >
              {cur.verified ? "확인됨" : "원문 대조 — 확인"}
            </Button>
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
            const issues = claimIssues(c);
            return (
              <ListItem
                key={c.id}
                as="button"
                type="button"
                current={i === sel}
                onClick={() => setSel(i)}
                leading={<Glyph title={MARK_LABEL[c.mark]}>{MARK_GLYPH[c.mark]}</Glyph>}
                title={c.text}
                meta={`${c.publisher ?? "출처 없음"} · ${c.asOf ? c.asOf.replace("T", " ") : "—"}`}
                trailing={issues.length ? <Badge tone="alert">{issues[0]}{issues.length > 1 ? ` +${issues.length - 1}` : ""}</Badge> : <Badge tone="accent">확인됨</Badge>}
              />
            );
          })}
        </List>
      </Card>
    </Split>
  );
}
