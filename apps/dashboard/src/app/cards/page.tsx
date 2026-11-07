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
  // 저장소 안 캡처만(외부 CDN 그림은 내보내기 캔버스를 오염시켜 PNG 를 못 만든다)
  for (const r of listReferences()) if (r.thumb.startsWith("/api/")) out.push({ id: `ref:${r.id}`, group: "reference", src: r.thumb, label: r.title });
  return out;
}

export default async function CardsPage() {
  const [decks, list] = await Promise.all([cardDecks().list(), assets()]);
  return (
    <Page>
      <PageHeader title="카드뉴스 제작" />
      <CardsEditor initialDecks={decks} assets={list} />
    </Page>
  );
}
