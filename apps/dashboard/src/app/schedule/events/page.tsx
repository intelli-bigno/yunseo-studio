// 일정 수집 현황 · 수동 입력 — 공식 원천이 파일로 주는 일정은 자동 수집, 없는 것(선거·타 중앙은행 등)은 확인 출처 URL 과 함께 손으로 넣는다.
// 렌더 전략: 서버 렌더(요청마다) — 수집 결과·쿼리(?error·?saved)에 따라 달라진다. 클라이언트 JS 없음(폼은 서버 액션).
import Link from "next/link";
import { CALENDAR_KIND_LABEL, eventKstParts, type CalendarEventKind } from "@yunseo/domain";
import { Badge, Button, Card, CardHeader, Field, FieldRow, Input, List, ListItem, Notice, Page, PageHeader, Select, Split, Stack, Table, TableHead, TableRow, Text, TextLink, Textarea } from "@yunseo/ui";
import { events } from "@/server/studio";
import { addManualEventAction, removeManualEventAction } from "../actions";

const fmtAt = (utc: string) => {
  const p = eventKstParts(utc);
  return `${p.date.slice(5).replace("-", ".")} ${p.time}`;
};

export default async function EventsPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const { error, saved } = await searchParams;
  const view = await events().getEventsOverview();

  return (
    <Page>
      <PageHeader title="일정 수집" meta="공식 일정 → 사건 후보 · 이번 주의 변수" actions={<TextLink as={Link} href="/schedule">← 편성</TextLink>} />
      <Split
        rail={
          <>
            <Card>
              <CardHeader title="수동 입력" />
              {error && <Notice>{error}</Notice>}
              {saved && <Notice tone="accent">저장했다</Notice>}
              <Stack as="form" action={addManualEventAction} gap={3}>
                <Field label="제목">
                  <Input name="title" required maxLength={120} placeholder="예: 미국 중간선거" />
                </Field>
                <FieldRow>
                  <Field label="날짜 (KST)">
                    <Input name="date" type="date" required />
                  </Field>
                  <Field label="시각 (KST, 모르면 비움)">
                    <Input name="time" type="time" />
                  </Field>
                </FieldRow>
                <Field label="종류">
                  <Select name="kind" defaultValue="other">
                    {view.kinds.map((k) => (
                      <option key={k} value={k}>{CALENDAR_KIND_LABEL[k as CalendarEventKind]}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="확인 출처 URL (공식 페이지)">
                  <Input name="sourceUrl" type="url" required placeholder="https://" mono />
                </Field>
                <Field label="메모">
                  <Textarea name="note" maxLength={300} />
                </Field>
                <Button variant="primary" type="submit">저장</Button>
              </Stack>
            </Card>
            <Card>
              <CardHeader title="기계 판독 원천이 없는 곳" />
              <List>
                {view.hints.map((h) => (
                  <ListItem key={h.org} as="a" href={h.url} target="_blank" rel="noreferrer" title={h.label} meta={h.url} trailing={<Badge>{h.org}</Badge>} />
                ))}
              </List>
            </Card>
          </>
        }
      >
        <Stack gap={4}>
          <Card>
            <CardHeader title="수집 현황" />
            <Table columns={["lg", "sm", "sm", "fill"]}>
              <TableHead>
                <span>원천</span>
                <span>마지막 수집 (KST)</span>
                <span>저장된 일정</span>
                <span>결과</span>
              </TableHead>
              {view.sources.map((s) => (
                <TableRow key={s.id}>
                  <Text size="title" truncate>{s.name}</Text>
                  <Text tone="mute" mono>{s.lastRun ? fmtAt(s.lastRun.at) : "—"}</Text>
                  <Text mono>{s.stored}</Text>
                  {s.lastRun === null ? (
                    <Text tone="mute">아직 수집 전</Text>
                  ) : s.lastRun.ok ? (
                    <Text tone="dim">신규 {s.lastRun.report?.inserted ?? 0} · 변경 {s.lastRun.report?.changed ?? 0} · 사라짐 {s.lastRun.report?.removed ?? 0}</Text>
                  ) : (
                    <Text tone="alert" truncate>{s.lastRun.error}</Text>
                  )}
                </TableRow>
              ))}
            </Table>
          </Card>

          <Card>
            <CardHeader title="일정 변경 이력" />
            {view.changes.length === 0 ? (
              <Text tone="mute">아직 바뀐 일정이 없다</Text>
            ) : (
              <List>
                {view.changes.map(({ change, label, from, to }) => (
                  <ListItem
                    key={`${change.eventId}-${change.at}-${change.type}`}
                    title={label}
                    meta={change.type === "time_changed" ? `${from} → ${to}` : change.type === "removed" ? "원천에서 사라짐" : change.type === "restored" ? "다시 나타남" : "제목 변경"}
                    trailing={<Text size="label" tone="mute" mono>{fmtAt(change.at)}</Text>}
                  />
                ))}
              </List>
            )}
          </Card>

          <Card>
            <CardHeader title="앞으로 30일 일정" />
            <Table columns={["sm", "sm", "fill", "sm", "sm"]}>
              <TableHead>
                <span>일시 (KST)</span>
                <span>종류</span>
                <span>이름</span>
                <span>자동 제안</span>
                <span>판정</span>
              </TableHead>
              {view.upcoming.map((r) => (
                <TableRow key={r.event.id}>
                  <Text mono>{`${r.when.date.slice(5).replace("-", ".")} ${r.when.weekday} ${r.when.time}`}</Text>
                  <Text tone="mute">{CALENDAR_KIND_LABEL[r.event.kind]}</Text>
                  <Text size="title" truncate>{r.event.label}</Text>
                  <Text tone="dim">{r.suggested}</Text>
                  <Text>{r.human ? r.human.decision : r.effective}</Text>
                </TableRow>
              ))}
            </Table>
            {view.upcoming.length === 0 && <Text tone="mute">수집한 일정 없음</Text>}
          </Card>

          {view.manual.length > 0 && (
            <Card>
              <CardHeader title="수동 입력한 일정" />
              <List>
                {view.manual.map((r) => (
                  <ListItem
                    key={r.event.id}
                    title={r.event.label}
                    meta={`${r.when.date.slice(5).replace("-", ".")} ${r.when.weekday} ${r.when.time} ${r.when.tz} · ${r.event.sourceUrl}`}
                    trailing={
                      <Stack as="form" action={removeManualEventAction} direction="row" gap={2}>
                        <input type="hidden" name="id" value={r.event.id} />
                        <Button variant="ghost" type="submit">삭제</Button>
                      </Stack>
                    }
                  />
                ))}
              </List>
            </Card>
          )}
        </Stack>
      </Split>
    </Page>
  );
}
