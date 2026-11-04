import type { BannedExpressionRule } from "@yunseo/domain";

/** 아직 정해지지 않은 값의 자리표시자. 남아 있으면 게시 단계에서 차단한다 (docs/01 §3). */
export const PLACEHOLDER = "TBD";

export interface BrandPreset {
  id: string;
  /** placeholder: 이름 미정 / confirmed: 이름·핸들 확정 */
  status: "placeholder" | "confirmed";
  name: string;
  handle: string;
  concept: string;
  core_sentence: string;
  /** 브랜드 인상 — 차분함·안목·신뢰감·접근성 */
  impression: string[];
  palette: { bg: string; ink: string; muted: string; accent: string };
  typeface: { display: string; body: string };
  logo: string;
  visual_rules: string[];
}

export interface CharacterPreset {
  id: string;
  /** undecided: 화자 형태 미정 (결정 D7) */
  kind: "undecided" | "person" | "illustrated" | "editor";
  name: string;
  speaking_style: string;
  appearance_ref: string;
}

export interface TonePreset {
  id: string;
  voice: string[];
  principles: string[];
  reading_level: string;
  emoji: "none" | "minimal";
}

export interface LanguagePreset {
  id: string;
  /** provisional: 발행 언어 미확정(이전 전달 기본값) / confirmed */
  status: "provisional" | "confirmed";
  publish: string;
  operator_ui: string;
  note: string;
}

export interface FormatStage {
  id: string;
  label: string;
  question: string;
}
export interface FormatCard {
  slot: string;
  stage: string | null;
  max_chars: number | null;
}
export interface FormatPreset {
  id: string;
  /** pre_issue: 사건 이전 / post_issue: 사건 이후 분석·연구 */
  kind: "pre_issue" | "post_issue";
  /** active: 사용 중 / reserved: 자리만 둠 */
  status: "active" | "reserved";
  publish_timing: string;
  /** 글자 수 상한 등 수치 값이 실측 전 가정인지 */
  limits_provisional: boolean;
  stages: FormatStage[];
  cards: FormatCard[];
}

export interface ActivePreset {
  brand: string;
  character: string;
  tone: string;
  language: string;
  compliance: string;
  formats: string[];
}

export interface PresetBundle {
  brand: BrandPreset;
  character: CharacterPreset;
  tone: TonePreset;
  language: LanguagePreset;
  formats: FormatPreset[];
  bannedExpressions: BannedExpressionRule[];
  /** 사용한 프리셋 파일 내용의 sha256 (게시물이 어느 프리셋으로 만들어졌는지 기록) */
  versionHash: string;
}
