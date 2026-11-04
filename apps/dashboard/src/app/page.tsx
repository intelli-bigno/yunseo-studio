// 오늘 — 시작 화면(안 B 벤토). 칸 크기 = 우선순위. 모든 항목은 클릭 1번에 해당 작업 탭으로 간다.
import Link from "next/link";
import {
  Badge,
  Button,
  Calendar,
  CalendarDay,
  Card,
  CardHeader,
  Cell,
  DateTile,
  EmptySlot,
  EmptyState,
  Glyph,
  Grid,
  List,
  ListItem,
  Metric,
  MetricRow,
  Page,
  PageHeader,
  Slot,
  Stack,
  Text,
  TextLink,
} from "@yunseo/ui";
import { GateTrack, KindMark, Pipeline, QueueChip } from "@/components/ui";
import { awaitingMe, blocked, claimIssues, currentGate, queueState, queueSummary, weekDates, weekday } from "@/lib/logic";
import { GATE_LABEL, MARK_GLYPH, type Piece } from "@/lib/model";
import { PIECES, QUEUE, TODAY, WEEK_START, WEEK_VARIABLES } from "@/lib/mock";
import { fmtSlot } from "@/lib/format";

const tabFor = (p: Piece) => {
  const g = currentGate(p);
  if (p.status === "evidence_wait") return "write";
  return g === "G2" ? "sources" : g === "G3" ? "review" : "write";
};
const href = (p: Piece) => `/content/${p.id}?tab=${tabFor(p)}`;

export default function TodayPage() {
  const mine = awaitingMe(PIECES);
  const stuck = blocked(PIECES);
  const q = queueSummary(QUEUE);
  const focus = mine[0] ?? stuck[0];
  const checked = focus ? focus.claims.filter((c) => claimIssues(c).length === 0).length : 0;
  const g = focus ? currentGate(focus) : null;

  return (
    <Page>
      <PageHeader title="오늘" actions={<Button as={Link} href="/content" variant="primary">＋ 새 편</Button>} />
      <Grid>
        <Cell span={8} rows={2}>
          <Card tone="feature" image="/img/hero.jpg">
            {focus ? (
              <Stack gap={5} justify="between" grow>
                <Stack gap={3}>
                  <Stack direction="row" gap={2}>
                    <KindMark kind={focus.kind} />
                    {g && <Badge tone="brass">{g} {GATE_LABEL[g]}</Badge>}
                  </Stack>
                  <Text as="h2" size="heading" block>{focus.title}</Text>
                  <Text tone="dim" mono>{fmtSlot(focus.slot)}</Text>
                </Stack>
                <Metric size="hero" value={checked} unit={`/ ${focus.claims.length}`} label="확인한 문장" />
                <Pipeline status={focus.status} />
                <Stack direction="row" gap={3}>
                  <Button as={Link} href={href(focus)} variant="primary">열기</Button>
                  <Button as={Link} href={`/content/${focus.id}?tab=preview`}>미리보기</Button>
                </Stack>
              </Stack>
            ) : (
              <EmptyState image="/img/empty.jpg" title="오늘 할 게이트 없음" />
            )}
          </Card>
        </Cell>

        <Cell span={4}>
          <Card>
            <CardHeader title="지금" />
            <MetricRow>
              <Metric value={mine.length} label="내 게이트" />
              <Metric value={stuck.length} label="막힘" tone={stuck.length ? "alert" : "default"} />
              <Metric value={q.ready} label="내보낼 것" tone="accent" />
            </MetricRow>
          </Card>
        </Cell>

        <Cell span={4}>
          <Card>
            <CardHeader title="막힌 편" action={<TextLink as={Link} href="/content">전체 →</TextLink>} />
            {stuck.length ? (
              <List>
                {stuck.map((p) => (
                  <ListItem key={p.id} as={Link} href={href(p)} title={p.title} meta={<Text size="label" tone="alert">{p.blocker}</Text>} trailing={<GateTrack piece={p} />} />
                ))}
              </List>
            ) : (
              <EmptyState image="/img/empty.jpg" title="막힌 편 없음" />
            )}
          </Card>
        </Cell>

        <Cell span={4}>
          <Card>
            <CardHeader title="내 게이트" />
            <List>
              {mine.map((p) => {
                const pg = currentGate(p);
                return <ListItem key={p.id} as={Link} href={href(p)} leading={<KindMark kind={p.kind} />} title={p.title} trailing={pg && <Badge tone="solid">{pg}</Badge>} />;
              })}
            </List>
          </Card>
        </Cell>

        <Cell span={4}>
          <Card>
            <CardHeader title="이번 주 변수" action={<TextLink as={Link} href="/schedule">편성 →</TextLink>} />
            <List>
              {WEEK_VARIABLES.map((v) => (
                <ListItem
                  key={v.label}
                  leading={<DateTile day={v.date.slice(8, 10)} sub={weekday(v.date)} />}
                  title={<><Glyph title={v.mark}>{MARK_GLYPH[v.mark]}</Glyph>{v.label}</>}
                  meta={`${v.time} · ${v.source}`}
                  trailing={v.importance === "major" ? <Badge tone="accent">major</Badge> : undefined}
                />
              ))}
            </List>
          </Card>
        </Cell>

        <Cell span={4}>
          <Card>
            <CardHeader title="발행 대기열" action={<TextLink as={Link} href="/publish">전체 →</TextLink>} />
            <List>
              {QUEUE.map((item) => {
                const p = PIECES.find((x) => x.id === item.pieceId)!;
                const s = queueState(item);
                return <ListItem key={item.pieceId + item.channel} as={Link} href={s === "needs_g3" ? `/content/${p.id}?tab=review` : "/publish"} title={p.title} meta={item.channel} trailing={<QueueChip s={s} />} />;
              })}
            </List>
          </Card>
        </Cell>

        <Cell span={12}>
          <Card>
            <CardHeader title="이번 주" action={<TextLink as={Link} href="/schedule">캘린더 →</TextLink>} />
            <Calendar compact>
              {weekDates(WEEK_START).map((d) => {
                const ps = PIECES.filter((p) => p.slot.startsWith(d));
                return (
                  <CalendarDay key={d} num={Number(d.slice(8, 10))} dow={weekday(d)} state={d === TODAY ? "today" : d < TODAY ? "past" : "default"}>
                    {ps.map((p) => (
                      <Slot key={p.id} as={Link} href={href(p)} time={p.slot.slice(11, 16)} gate={currentGate(p) ?? ""} solid={p.kind === "pre" || p.kind === "post"} />
                    ))}
                    {ps.length === 0 && d >= TODAY && <EmptySlot>빈 날</EmptySlot>}
                  </CalendarDay>
                );
              })}
            </Calendar>
          </Card>
        </Cell>
      </Grid>
    </Page>
  );
}
