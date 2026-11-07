// 콘텐츠 목록의 카드 한 칸 — 그림 자리(캐러셀·한 장·자리 표시) + 제목 + 종류·상태·게이트. 클릭하면 편 상세.
// 서버 컴포넌트다: 장(MediaSlide)은 여기서 그려 캐러셀에 children 으로 넘긴다(캐러셀만 클라이언트).
import Link from "next/link";
import type { Piece } from "@yunseo/domain";
import { MediaCard, MediaSlide, Stack, Text } from "@yunseo/ui";
import { Carousel } from "@yunseo/ui/carousel";
import { fmtSlot } from "@/lib/format";
import { frameKind, type Slide } from "@/lib/thumbs";
import { GateTrack, KindMark, StatusChip } from "./ui";

export function PieceCard({ piece, href, slides, reel }: { piece: Piece; href: string; slides: Slide[]; reel: boolean }) {
  const kind = frameKind(slides.length);
  const first = slides[0];
  return (
    <MediaCard
      as={Link}
      href={href}
      title={piece.title}
      meta={`${fmtSlot(piece.slot)}${reel ? " · 릴스" : ""}`}
      frame={
        kind === "carousel" ? (
          <Carousel count={slides.length} label={piece.title}>
            {slides.map((s) => (
              <MediaSlide key={s.src} as={Link} href={href} src={s.src} alt={s.alt} />
            ))}
          </Carousel>
        ) : (
          <MediaSlide as={Link} href={href} src={first?.src} alt={first?.alt}>
            <Text tone="mute" size="label">렌더 전</Text>
          </MediaSlide>
        )
      }
    >
      <Stack direction="row" gap={2} align="center" wrap>
        <KindMark kind={piece.kind} />
        <StatusChip status={piece.status} />
        <GateTrack piece={piece} />
      </Stack>
    </MediaCard>
  );
}
