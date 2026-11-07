// 콘텐츠 목록 — 편집기에서 저장한 카드뉴스 덱 한 칸. 장마다 CardView 를 작게 그려 캐러셀로 넘겨 본다. 클릭하면 편집기에서 연다.
import Link from "next/link";
import type { CardDeck } from "@yunseo/domain";
import { MediaCard, MediaSlide, Text } from "@yunseo/ui";
import { Carousel } from "@yunseo/ui/carousel";
import { CardView } from "./CardView";

const ASPECT = { "4:5": "portrait", "1:1": "square", "9:16": "story" } as const;

export function DeckMediaCard({ deck, updatedAt }: { deck: CardDeck; updatedAt: string }) {
  const href = `/cards?deck=${encodeURIComponent(deck.id)}`;
  const slides = deck.cards.map((c) => (
    <MediaSlide key={c.id} as={Link} href={href}>
      <CardView card={c} preset={deck.preset} watermark={deck.watermark} mini />
    </MediaSlide>
  ));
  return (
    <MediaCard as={Link} href={href} aspect={ASPECT[deck.preset]} title={deck.title} meta={`편집기 · ${deck.cards.length}장 · ${updatedAt.slice(0, 16).replace("T", " ")}`}
      frame={slides.length > 1 ? <Carousel count={slides.length} label={deck.title}>{slides}</Carousel> : slides}
    >
      <Text tone="mute" size="label">카드뉴스 편집기</Text>
    </MediaCard>
  );
}
