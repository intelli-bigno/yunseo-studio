// [cards] 카드 한 장 그리기 — 편집 캔버스·덱 줄 미리보기·콘텐츠 목록 썸네일이 같이 쓴다(훅 없음 — 서버·클라이언트 어디서나).
import type { DragEvent, PointerEvent, ReactNode } from "react";
import { CARD_PRESETS, imageFilter, stickerDataUrl, watermarkAnchors, type CardFont, type CardLayer, type CardPresetId, type DeckCard, type DragMode, type Watermark } from "@yunseo/domain";
import { CanvasHandles, CanvasImage, CanvasLayer, CanvasOverlay, CanvasStage, CanvasText, CanvasWatermark } from "@yunseo/ui";

/** 화면 글자 서체 — 본문·고정폭은 앱 서체 변수, 명조는 시스템 */
export const cssFamily = (f: CardFont) => (f === "sans" ? "var(--font-sans), sans-serif" : f === "mono" ? "var(--font-mono), monospace" : "'Noto Serif KR', 'Nanum Myeongjo', serif");

/** 빈 카드 안내 — 화면에만 겹친다(PNG 내보내기는 drawCard 로 따로 그려서 들어가지 않는다) */
export const EMPTY_HINT = "이미지를 끌어오거나 텍스트 추가";
export const EMPTY_HINT_MINI = "빈 카드";

export function WatermarkView({ wm, preset }: { wm: Watermark; preset: CardPresetId }) {
  const { width: cw, height: ch } = CARD_PRESETS[preset];
  // 화면에서는 글자 폭을 재지 않고 대략(글자 수 × 0.6em)으로 가장자리 여백을 잡는다
  const iw = wm.kind === "image" ? wm.size : wm.text.length * wm.size * 0.6;
  const items = watermarkAnchors(wm, preset, iw, wm.size);
  return <CanvasWatermark items={items} cw={cw} ch={ch} kind={wm.kind} text={wm.text} src={wm.src} size={wm.size} color={wm.color} opacity={wm.opacity} angle={wm.tile ? wm.angle : 0} />;
}

export function CardView({ card, preset, watermark = null, mini = false, selected, onLayerDown, onHandleDown, onDrop, children }: {
  card: DeckCard;
  preset: CardPresetId;
  watermark?: Watermark | null;
  mini?: boolean;
  selected?: string | null;
  onLayerDown?: (l: CardLayer, e: PointerEvent<HTMLDivElement>) => void;
  onHandleDown?: (l: CardLayer, mode: DragMode, e: PointerEvent<HTMLSpanElement>) => void;
  onDrop?: (e: DragEvent<HTMLDivElement>) => void;
  children?: ReactNode;
}) {
  const { width: cw, height: ch, label } = CARD_PRESETS[preset];
  const hint = card.layers.length === 0 ? (mini ? EMPTY_HINT_MINI : EMPTY_HINT) : undefined;
  return (
    <CanvasStage width={cw} height={ch} background={card.background} label={`카드 캔버스 ${label}`} mini={mini} hint={hint} onDragOver={onDrop ? (e) => e.preventDefault() : undefined} onDrop={onDrop}>
      {card.layers.map((l) =>
        l.hidden ? null : (
          <CanvasLayer key={l.id} box={l} cw={cw} ch={ch} label={l.name} rotation={l.rotation} locked={l.locked} opacity={l.kind === "sticker" ? l.opacity : 1} blend={l.kind === "overlay" ? l.blend : undefined} selected={!mini && selected === l.id} onPointerDown={onLayerDown ? (e) => onLayerDown(l, e) : undefined}>
            {l.kind === "image" && <CanvasImage src={l.src} fit={l.fit} posX={l.posX} posY={l.posY} zoom={l.zoom} filter={imageFilter(l, (px) => `${(px / cw) * 100}cqw`)} />}
            {l.kind === "sticker" && <CanvasImage src={stickerDataUrl(l)} fit="contain" />}
            {l.kind === "overlay" && <CanvasOverlay opacity={l.opacity} color={l.color} gradient={l.gradient} from={l.gradFrom} to={l.gradTo} />}
            {l.kind === "text" && (
              <CanvasText text={l.text} family={cssFamily(l.font)} size={l.size} cw={cw} weight={l.weight} color={l.color} align={l.align} lineHeight={l.lineHeight} letterSpacing={l.letterSpacing} vAlign={l.vAlign} margin={l.margin} padding={l.padding} boxColor={l.boxColor} boxOpacity={l.boxOpacity} />
            )}
            {!mini && selected === l.id && !l.locked && onHandleDown && <CanvasHandles onPointerDown={(m, e) => onHandleDown(l, m, e)} />}
          </CanvasLayer>
        ),
      )}
      {watermark && <WatermarkView wm={watermark} preset={preset} />}
      {children}
    </CanvasStage>
  );
}
