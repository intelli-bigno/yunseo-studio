// 편성 캘린더 — 주(기본)·월. 오른쪽 레일: 이번 주 변수 + 사건 후보함(G1).
// 렌더 전략: 서버 렌더(요청마다) — 주/월이 쿼리(?view)라 정적 생성이 안 된다. 데이터는 읽기 캐시라 요청당 비용이 작다.
// 사건 후보함만 클라이언트 섬(판정 버튼). 나머지는 JS 가 없다.
import Link from "next/link";
import { weekday } from "@yunseo/domain";
import { Badge, Calendar, CalendarDay, Card, CardHeader, DateTile, EmptySlot, Glyph, List, ListItem, Page, PageHeader, SegmentedItem, Segmented, Slot, Split, TextLink } from "@yunseo/ui";
import { CandidateList } from "@/components/CandidateList";
import { KindMark } from "@/components/ui";
import { fmtWeekRange } from "@/lib/format";
import { heroMedia } from "@/lib/media";
import { MARK_GLYPH, STATUS_LABEL } from "@/lib/labels";
import { studio } from "@/server/studio";

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view: raw } = await searchParams;
  const view = await studio().getSchedule(raw === "month" ? "month" : "week");
  const month = view.mode === "month";

  return (
    <Page>
      <PageHeader
        title={month ? `${Number(view.today.slice(5, 7))}월` : fmtWeekRange(view.from, view.to)}
        actions={
          <Segmented label="보기">
            <SegmentedItem as={Link} href="/schedule" current={!month}>주</SegmentedItem>
            <SegmentedItem as={Link} href="/schedule?view=month" current={month}>월</SegmentedItem>
          </Segmented>
        }
      />
      <Split
        rail={
          <>
            <Card tone="feature" media={heroMedia("/img/schedule.jpg", { width: 1600, height: 900 })}>
              <CardHeader title="이번 주 변수" action={<TextLink as={Link} href="/content/S-W45">스토리 →</TextLink>} />
              <List>
                {view.variables.map((v) => (
                  <ListItem
                    key={v.label}
                    leading={<DateTile day={v.date.slice(8, 10)} sub={weekday(v.date)} />}
                    title={<><Glyph title={v.mark}>{MARK_GLYPH[v.mark]}</Glyph>{v.label}</>}
                    meta={`${v.time} ${v.tz} · ${v.source}`}
                    trailing={v.importance === "major" ? <Badge tone="accent">major</Badge> : undefined}
                  />
                ))}
              </List>
            </Card>
            <Card>
              <CardHeader title="사건 후보 · G1" />
              <CandidateList initial={view.candidates} />
            </Card>
          </>
        }
      >
        <Calendar compact={month}>
          {view.days.map((d) => (
            <CalendarDay key={d.date} num={Number(d.date.slice(8, 10))} dow={weekday(d.date)} state={d.state}>
              {d.pieces.map((r) => (
                <Slot
                  key={r.piece.id}
                  as={Link}
                  href={`/content/${r.piece.id}`}
                  time={r.piece.slot.slice(11, 16)}
                  gate={r.gate ?? STATUS_LABEL[r.piece.status]}
                  title={month ? undefined : r.piece.title}
                  solid={r.piece.kind === "pre" || r.piece.kind === "post"}
                >
                  {!month && <KindMark kind={r.piece.kind} />}
                </Slot>
              ))}
              {!month && d.pieces.length === 0 && d.date >= view.today && <EmptySlot>빈 날</EmptySlot>}
            </CalendarDay>
          ))}
        </Calendar>
      </Split>
    </Page>
  );
}
