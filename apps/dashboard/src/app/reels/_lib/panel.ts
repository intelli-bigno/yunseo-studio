// [릴스 편집기] 패널(인스펙터·효과·자산)이 같이 받는 값.
import type { Editor } from "./use-editor";
import type { Clip, SourceRef, Track } from "./types";

export interface PanelProps {
  ed: Editor;
  sources: SourceRef[];
  /** 고른 클립 — 슬라이더를 끄는 동안은 임시 값이 반영된 것 */
  clip: Clip | null;
  track: Track | null;
  /** 재생 위치(ms) */
  time: number;
  /** 슬라이더 미리보기용 임시 클립(null 이면 해제) */
  setDraft: (c: Clip | null) => void;
}
