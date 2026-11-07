// 콘텐츠 — 3종(이전·이후·연구) + 스토리 목록을 썸네일 카드 그리드로. 카드 클릭 → 편 상세(지금 게이트의 탭).
// 렌더한 카드가 2장 이상이면 카드 안에서 넘겨 보고(캐러셀), 1장이면 썸네일 한 장, 아직 렌더 전이면 자리 표시.
// 렌더 전략: 서버 렌더(요청마다, ?kind 쿼리). 카드는 서버 컴포넌트(캐러셀 조각만 클라이언트)이고, 화면 밖 카드는 ui 의 content-visibility 가 그리기를 건너뛴다.
import Link from "next/link";
import { PIECE_KINDS, type PieceKind } from "@yunseo/domain";
import { Button, Card, EmptyState, MediaGrid, Page, PageHeader, SegmentedItem, Segmented, Stack } from "@yunseo/ui";
import { PieceCard } from "@/components/PieceCard";
import { KIND_LABEL } from "@/lib/labels";
import { emptyMedia } from "@/lib/media";
import { pieceHref } from "@/lib/nav";
import { slidesOf } from "@/lib/thumbs";
import { authoring, pipeline, studio } from "@/server/studio";
import { seedDemoAction } from "./actions";

const KINDS: (PieceKind | "all")[] = ["all", ...PIECE_KINDS];
const isKind = (v: string | undefined): v is PieceKind => !!v && (PIECE_KINDS as readonly string[]).includes(v);

export default async function ContentPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind: raw } = await searchParams;
  const kind = isKind(raw) ? raw : "all";
  const { rows } = await studio().listContent(kind);
  const previews = await pipeline().previews(rows.map((r) => r.piece)); // [W4] 편마다 지금 내용으로 렌더한 카드 수·릴스 유무
  const empty = rows.length === 0 && (await authoring().isEmpty()); // [L2] 저장소 전체가 비었을 때만 데모 채우기를 보인다
  return (
    <Page>
      <PageHeader
        title="콘텐츠"
        actions={
          <Stack direction="row" gap={3} align="center" wrap>
            <Button as={Link} href="/content/new" variant="primary">새 편</Button>
            <Segmented label="종류">
              {KINDS.map((k) => (
                <SegmentedItem key={k} as={Link} href={k === "all" ? "/content" : `/content?kind=${k}`} current={kind === k}>
                  {k === "all" ? "전체" : KIND_LABEL[k]}
                </SegmentedItem>
              ))}
            </Segmented>
          </Stack>
        }
      />
      {rows.length ? (
        <MediaGrid>
          {rows.map((r) => {
            const preview = previews[r.piece.id];
            return <PieceCard key={r.piece.id} piece={r.piece} href={pieceHref(r)} slides={slidesOf(r.piece.id, r.piece.title, preview ?? { cards: 0, alts: [] })} reel={preview?.reel ?? false} />;
          })}
        </MediaGrid>
      ) : (
        <Card>
          <EmptyState
            media={emptyMedia()}
            title={empty ? "저장소가 비어 있음 — 새 편을 만들거나 시안으로 채운다" : "이 종류의 편이 없음"}
            action={
              empty ? (
                <form action={seedDemoAction}>
                  <Button type="submit">빈 DB 데모 채우기</Button>
                </form>
              ) : undefined
            }
          />
        </Card>
      )}
    </Page>
  );
}
