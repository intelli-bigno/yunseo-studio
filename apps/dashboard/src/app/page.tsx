// 오늘 — 시작 화면(안 B 벤토). 칸 크기 = 우선순위. 모든 항목은 클릭 1번에 해당 작업 탭으로 간다.
// 렌더 전략: 정적(서버 컴포넌트, 클라이언트 JS 없음) + 60초 재검증. 요청별 입력이 없고 데이터는 읽기 캐시가 받쳐 준다(docs/09-performance.md §2).
import Link from "next/link";
import { weekday } from "@yunseo/domain";
import { Badge, Button, Calendar, CalendarDay, Card, CardHeader, Cell, DateTile, EmptySlot, EmptyState, Glyph, Grid, List, ListItem, Metric, MetricRow, Page, PageHeader, Slot, Stack, Text, TextLink } from "@yunseo/ui";
import { GateTrack, KindMark, Pipeline, QueueChip } from "@/components/ui";
import { fmtSlot } from "@/lib/format";
import { emptyMedia, heroMedia } from "@/lib/media";
import { GATE_LABEL, MARK_GLYPH } from "@/lib/labels";
import { pieceHref } from "@/lib/nav";
import { studio } from "@/server/studio";

export const revalidate = 60;

export default async function TodayPage() {
  const board = await studio().getTodayBoard();
  const { focus, mine, stuck, queueSummary: q } = board;
  const empty = emptyMedia();

  return (
    <Page>
      <PageHeader title="오늘" actions={<Button as={Link} href="/content" variant="primary">＋ 새 편</Button>} />
      <Grid>
        <Cell span={8} rows={2}>
          <Card tone="feature" media={heroMedia("/img/hero.jpg", { width: 1600, height: 1066 }, true)}>
            {focus ? (
              <Stack gap={5} justify="between" grow>
                <Stack gap={3}>
                  <Stack direction="row" gap={2}>
                    <KindMark kind={focus.piece.kind} />
                    {focus.gate && <Badge tone="brass">{focus.gate} {GATE_LABEL[focus.gate]}</Badge>}
                  </Stack>
                  <Text as="h2" size="heading" block>{focus.piece.title}</Text>
                  <Text tone="dim" mono>{fmtSlot(focus.piece.slot)}</Text>
                </Stack>
                <Metric size="hero" value={board.focusChecked} unit={`/ ${focus.piece.claims.length}`} label="확인한 문장" />
                <Pipeline status={focus.piece.status} />
                <Stack direction="row" gap={3}>
                  <Button as={Link} href={pieceHref(focus)} variant="primary">열기</Button>
                  <Button as={Link} href={`/content/${focus.piece.id}?tab=preview`}>미리보기</Button>
                </Stack>
              </Stack>
            ) : (
              <EmptyState media={empty} title="오늘 할 게이트 없음" />
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
                {stuck.map((r) => (
                  <ListItem key={r.piece.id} as={Link} href={pieceHref(r)} title={r.piece.title} meta={<Text size="label" tone="alert">{r.piece.blocker}</Text>} trailing={<GateTrack piece={r.piece} />} />
                ))}
              </List>
            ) : (
              <EmptyState media={empty} title="막힌 편 없음" />
            )}
          </Card>
        </Cell>

        <Cell span={4}>
          <Card>
            <CardHeader title="내 게이트" />
            <List>
              {mine.map((r) => (
                <ListItem key={r.piece.id} as={Link} href={pieceHref(r)} leading={<KindMark kind={r.piece.kind} />} title={r.piece.title} trailing={r.gate && <Badge tone="solid">{r.gate}</Badge>} />
              ))}
            </List>
          </Card>
        </Cell>

        <Cell span={4}>
          <Card>
            <CardHeader title="이번 주 변수" action={<TextLink as={Link} href="/schedule">편성 →</TextLink>} />
            <List>
              {board.variables.map((v) => (
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
              {board.queue.map(({ item, piece, state }) => (
                <ListItem key={item.pieceId + item.channel} as={Link} href={state === "needs_g3" ? `/content/${piece.id}?tab=review` : "/publish"} title={piece.title} meta={item.channel} trailing={<QueueChip s={state} />} />
              ))}
            </List>
          </Card>
        </Cell>

        <Cell span={12}>
          <Card>
            <CardHeader title="이번 주" action={<TextLink as={Link} href="/schedule">캘린더 →</TextLink>} />
            <Calendar compact>
              {board.week.map((d) => (
                <CalendarDay key={d.date} num={Number(d.date.slice(8, 10))} dow={weekday(d.date)} state={d.state}>
                  {d.pieces.map((r) => (
                    <Slot key={r.piece.id} as={Link} href={pieceHref(r)} time={r.piece.slot.slice(11, 16)} gate={r.gate ?? ""} solid={r.piece.kind === "pre" || r.piece.kind === "post"} />
                  ))}
                  {d.pieces.length === 0 && d.date >= board.today && <EmptySlot>빈 날</EmptySlot>}
                </CalendarDay>
              ))}
            </Calendar>
          </Card>
        </Cell>
      </Grid>
    </Page>
  );
}
