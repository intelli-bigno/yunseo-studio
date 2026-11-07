// 카드뉴스 제작 — 가벼운 레이어 편집기. 서버는 덱 목록·자산 목록만 모아 넘기고, 편집·저장은 클라이언트 섬(CardsEditor)이 API 로 한다.
import { Page, PageHeader } from "@yunseo/ui";
import { CardsEditor, type EditorAsset } from "@/components/CardsEditor";
import { listReels, listReferences } from "@/server/library";
import { cardDecks, studio } from "@/server/studio";

export const dynamic = "force-dynamic";

async function assets(): Promise<EditorAsset[]> {
  const out: EditorAsset[] = [];
  const set = await studio().getCardSet();
  for (const name of set.names) out.push({ id: `card:${name}`, group: "generated", src: `/api/cards/${encodeURIComponent(name)}`, label: `카드 ${name}` });
  for (const g of await listReels()) {
    const v = g.versions.find((x) => x.hasCover);
    if (v) out.push({ id: `reel:${g.pieceId}`, group: "generated", src: `/api/reels/${g.pieceId}/${v.renderId}/cover`, label: `${g.title} 표지` });
  }
  // 수집 레퍼런스 전부 — 저장소 캡처는 /api/refs, 외부 CDN 그림은 같은 출처 프록시(/api/ref-image)로 넣는다(그래야 PNG 내보내기가 막히지 않는다).
  // 그리드 미리보기는 원본 주소(view)로 바로 받는다.
  for (const r of listReferences()) {
    const local = r.thumb.startsWith("/api/");
    out.push({ id: `ref:${r.id}`, group: "reference", src: local ? r.thumb : `/api/ref-image/${encodeURIComponent(r.id)}`, view: r.thumb, label: r.title || r.takeaway || r.id, set: r.set, tags: r.tags, href: r.href });
  }
  return out;
}

// 들어오면 바로 새 덱 캔버스(목록·중간 화면 없음). ?deck=<id> 면 그 덱을 열어 시작한다(콘텐츠 탭에서 누를 때)
export default async function CardsPage({ searchParams }: { searchParams: Promise<{ deck?: string }> }) {
  const { deck: id } = await searchParams;
  const [decks, list, rec] = await Promise.all([cardDecks().list(), assets(), id ? cardDecks().open(id) : Promise.resolve(null)]);
  return (
    <Page fit>
      <PageHeader title="카드뉴스 제작" />
      <CardsEditor initialDecks={decks} initial={rec ? { deck: rec.deck, revision: rec.revision } : null} assets={list} />
    </Page>
  );
}
