// 편성 캘린더 — 주(기본)·월. 오른쪽 레일: 이번 주 변수 + 사건 후보함(G1).
import Link from "next/link";
import { Badge, Calendar, CalendarDay, Card, CardHeader, DateTile, EmptySlot, Glyph, List, ListItem, Page, PageHeader, SegmentedItem, Segmented, Slot, Split, TextLink } from "@yunseo/ui";
import { CandidateList } from "@/components/CandidateList";
import { KindMark } from "@/components/ui";
import { addDays, currentGate, weekDates, weekday } from "@/lib/logic";
import { MARK_GLYPH, STATUS_LABEL } from "@/lib/model";
import { EVENT_CANDIDATES, PIECES, TODAY, WEEK_START, WEEK_VARIABLES } from "@/lib/mock";

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  const month = view === "month";
  const days = month ? Array.from({ length: 35 }, (_, i) => addDays("2026-10-26", i)) : weekDates(WEEK_START);

  return (
    <Page>
      <PageHeader
        title={month ? "11월" : "11월 2일 — 8일"}
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
            <Card tone="feature" image="/img/schedule.jpg">
              <CardHeader title="이번 주 변수" action={<TextLink as={Link} href="/content/S-W45">스토리 →</TextLink>} />
              <List>
                {WEEK_VARIABLES.map((v) => (
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
              <CandidateList initial={EVENT_CANDIDATES} />
            </Card>
          </>
        }
      >
        <Calendar compact={month}>
          {days.map((d) => {
            const ps = PIECES.filter((p) => p.slot.startsWith(d)).sort((a, b) => a.slot.localeCompare(b.slot));
            return (
              <CalendarDay key={d} num={Number(d.slice(8, 10))} dow={weekday(d)} state={d === TODAY ? "today" : d < TODAY ? "past" : "default"}>
                {ps.map((p) => (
                  <Slot
                    key={p.id}
                    as={Link}
                    href={`/content/${p.id}`}
                    time={p.slot.slice(11, 16)}
                    gate={currentGate(p) ?? STATUS_LABEL[p.status]}
                    title={month ? undefined : p.title}
                    solid={p.kind === "pre" || p.kind === "post"}
                  >
                    {!month && <KindMark kind={p.kind} />}
                  </Slot>
                ))}
                {!month && ps.length === 0 && d >= TODAY && <EmptySlot>빈 날</EmptySlot>}
              </CalendarDay>
            );
          })}
        </Calendar>
      </Split>
    </Page>
  );
}
