import { weekday } from "@yunseo/domain";

/** 2026-11-04T21:00 → 11.04 수 21:00 */
export function fmtSlot(iso: string): string {
  return `${iso.slice(5, 7)}.${iso.slice(8, 10)} ${weekday(iso)} ${iso.slice(11, 16)}`.trim();
}

export function fmtDay(iso: string): string {
  return `${iso.slice(5, 7)}.${iso.slice(8, 10)} ${weekday(iso)}`;
}

/** 짝 없는 서로게이트(잘린 이모지 반쪽)를 지운다 — 서버가 U+FFFD 로 바꿔 보내면 브라우저 쪽 글자와 달라 하이드레이션 경고가 난다. 온전한 쌍(이모지)은 그대로 둔다 */
export function stripLoneSurrogates(text: string): string {
  return text.replace(/\p{Surrogate}/gu, "");
}

/** 글자(코드포인트) 단위로 max 개까지만 남긴다 — `slice` 는 UTF-16 단위라 이모지를 반으로 가른다. 잘렸으면 끝 공백을 지운다 */
export function clipCodePoints(text: string, max: number): string {
  const chars = [...stripLoneSurrogates(text)];
  return chars.length <= max ? chars.join("") : chars.slice(0, max).join("").trimEnd();
}
