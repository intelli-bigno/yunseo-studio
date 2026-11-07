// [릴스 편집기] 화면에 쓰는 이름표·고정 목록. 값은 docs/12 §7 의 기본안(미정 항목은 가장 단순한 값)을 따른다.
import type { Corner, KeyProp, TrackKind, TransitionKind } from "./types";

/** 자막·텍스트 스타일 프리셋 — 문서 §7 기본안: subtitle-default · viral-white · viral-yellow (+ v1 변환값 text-default) */
export const TEXT_STYLES: { id: string; label: string }[] = [
  { id: "subtitle-default", label: "기본 자막" },
  { id: "viral-white", label: "바이럴 흰색" },
  { id: "viral-yellow", label: "바이럴 노랑" },
  { id: "text-default", label: "기본 글자" },
];

export const TRACK_LABEL: Record<TrackKind, string> = { video: "영상", text: "텍스트", subtitle: "자막", audio: "음성", overlay: "오버레이" };
export const TRANSITION_LABEL: Record<TransitionKind, string> = { cut: "컷", crossfade: "페이드", dip: "딥", slide: "슬라이드" };
export const KEY_LABEL: Record<KeyProp, string> = { cx: "가로", cy: "세로", scale: "크기", rotation: "회전", opacity: "투명도", volumeDb: "볼륨" };
export const CORNER_LABEL: Record<Corner, string> = { tl: "왼쪽 위", tr: "오른쪽 위", bl: "왼쪽 아래", br: "오른쪽 아래" };
export const DIRECTION_LABEL = { left: "왼쪽", right: "오른쪽", up: "위", down: "아래" } as const;
export const SPEED_PRESETS = [0.5, 1, 2] as const;

/** 텍스트 클립의 기본 자리(캔버스 비율) — 문서 TextBody.box */
export const DEFAULT_TEXT_BOX = { text: { cx: 0.5, cy: 0.3, w: 0.86 }, subtitle: { cx: 0.5, cy: 0.82, w: 0.86 } } as const;
