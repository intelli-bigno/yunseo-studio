// 콘텐츠 — 3종(이전·이후·연구) + 스토리 목록. 행 클릭 → 편 상세(지금 게이트의 탭).
// 렌더 전략: 서버 렌더(요청마다, ?kind 쿼리). 행은 서버 컴포넌트라 JS 가 없고, 행이 많아져도 ui 의 content-visibility 가 화면 밖 행의 그리기를 건너뛴다.
import Link from "next/link";
import { PIECE_KINDS, type PieceKind } from "@yunseo/domain";
import { Card, EmptyState, Page, PageHeader, SegmentedItem, Segmented, Table, TableHead, TableRow, Text } from "@yunseo/ui";
import { GateTrack, KindMark, StatusChip } from "@/components/ui";
import { fmtSlot } from "@/lib/format";
import { KIND_LABEL } from "@/lib/labels";
import { emptyMedia } from "@/lib/media";
import { pieceHref } from "@/lib/nav";
import { studio } from "@/server/studio";

const KINDS: (PieceKind | "all")[] = ["all", ...PIECE_KINDS];
const isKind = (v: string | undefined): v is PieceKind => !!v && (PIECE_KINDS as readonly string[]).includes(v);

export default async function ContentPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind: raw } = await searchParams;
  const kind = isKind(raw) ? raw : "all";
  const { rows } = await studio().listContent(kind);
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
        {rows.length ? (
          <Table columns={["md", "sm", "fill", "auto", "auto"]}>
            <TableHead>
              <span>슬롯</span>
              <span>종류</span>
              <span>제목</span>
              <span>게이트</span>
              <span>상태</span>
            </TableHead>
            {rows.map((r) => (
              <TableRow key={r.piece.id} as={Link} href={pieceHref(r)}>
                <Text tone="mute" mono>{fmtSlot(r.piece.slot).slice(0, 8)}</Text>
                <KindMark kind={r.piece.kind} />
                <Text size="title" truncate>{r.piece.title}</Text>
                <GateTrack piece={r.piece} />
                <StatusChip status={r.piece.status} />
              </TableRow>
            ))}
          </Table>
        ) : (
          <EmptyState media={emptyMedia()} title="이 종류의 편이 없음" />
        )}
      </Card>
    </Page>
  );
}
