// 콘텐츠 — 3종(이전·이후·연구) + 스토리 목록. 행 클릭 → 편 상세(지금 게이트의 탭).
import Link from "next/link";
import { Card, EmptyState, Page, PageHeader, SegmentedItem, Segmented, Table, TableHead, TableRow, Text } from "@yunseo/ui";
import { GateTrack, KindMark, StatusChip } from "@/components/ui";
import { currentGate } from "@/lib/logic";
import { KIND_LABEL, type Kind } from "@/lib/model";
import { PIECES } from "@/lib/mock";
import { fmtSlot } from "@/lib/format";

const KINDS: (Kind | "all")[] = ["all", "pre", "post", "research", "story"];

export default async function ContentPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind = "all" } = await searchParams;
  const list = PIECES.filter((p) => kind === "all" || p.kind === kind).sort((a, b) => b.slot.localeCompare(a.slot));
  return (
    <Page>
      <PageHeader
        title="콘텐츠"
        actions={
          <Segmented label="종류">
            {KINDS.map((k) => (
              <SegmentedItem key={k} as={Link} href={k === "all" ? "/content" : `/content?kind=${k}`} current={kind === k}>
                {k === "all" ? "전체" : KIND_LABEL[k]}
              </SegmentedItem>
            ))}
          </Segmented>
        }
      />
      <Card>
        {list.length ? (
          <Table columns={["md", "sm", "fill", "auto", "auto"]}>
            <TableHead>
              <span>슬롯</span>
              <span>종류</span>
              <span>제목</span>
              <span>게이트</span>
              <span>상태</span>
            </TableHead>
            {list.map((p) => {
              const g = currentGate(p);
              const tab = g === "G2" ? "sources" : g === "G3" ? "review" : "write";
              return (
                <TableRow key={p.id} as={Link} href={`/content/${p.id}?tab=${tab}`}>
                  <Text tone="mute" mono>{fmtSlot(p.slot).slice(0, 8)}</Text>
                  <KindMark kind={p.kind} />
                  <Text size="title" truncate>{p.title}</Text>
                  <GateTrack piece={p} />
                  <StatusChip status={p.status} />
                </TableRow>
              );
            })}
          </Table>
        ) : (
          <EmptyState image="/img/empty.jpg" title="이 종류의 편이 없음" />
        )}
      </Card>
    </Page>
  );
}
