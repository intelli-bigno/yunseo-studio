// 카드 테마 — 카드 예시 v2(docs/design/card-reference/v2/style-bible.md)의 색·치수. 대시보드 토큰(Club Green)과 별개의 「카드 면」 값이다.
// 브랜드 확정(결정 D5·D13) 전까지는 잠정값이고, 확정되면 이 한 파일만 바꾼다. 카드 판형은 1080×1350(4:5).
export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;
/** 카드 서체 — 저장소 안 fonts/ 의 Pretendard(SIL OFL). 외부 웹폰트를 쓰지 않는다 */
export const FONT_FAMILY = "Pretendard";

export const THEME = {
  navy: "#0A121C",
  cream: "#F4F0E8",
  mut: "rgba(244,240,232,.66)",
  brass: "#CDA46B",
  ink: "#111111",
  paper: "#EFEAE0",
  paperMut: "#6A655C",
  paperRule: "#CFC7B8",
  /** 배경 사진이 없을 때의 토큰 색 배경 — 슬레이트 블루에서 짙은 네이비로 (스타일 바이블의 그림자 색) */
  tokenBackground: "linear-gradient(180deg, #223448 0%, #14212F 50%, #0A121C 100%)",
  /** 본문 장 — 위쪽은 사진이 보이고 아래로 갈수록 짙어져 글자 대비를 확보한다 */
  shade: "linear-gradient(180deg, rgba(10,18,28,.10) 0%, rgba(10,18,28,0) 30%, rgba(10,18,28,.50) 44%, rgba(10,18,28,.88) 58%, rgba(10,18,28,.95) 100%)",
  shadeCover: "linear-gradient(180deg, rgba(10,18,28,.28) 0%, rgba(10,18,28,0) 22%, rgba(10,18,28,0) 46%, rgba(10,18,28,.62) 66%, rgba(10,18,28,.92) 100%)",
} as const;
