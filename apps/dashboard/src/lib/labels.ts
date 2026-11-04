// 표시용 한국어 라벨·기호 — 도메인 값(종류·상태·게이트·구분)을 화면 문구로 옮기는 표.
import type { GateId, Mark, PieceKind, PieceStatus } from "@yunseo/domain";

export const KIND_LABEL: Record<PieceKind, string> = { pre: "이전", post: "이후", research: "연구", story: "스토리" };

export const GATE_LABEL: Record<GateId, string> = { G1: "주제·관점", G2: "사실 확인", G3: "발행 판단" };

export const STATUS_LABEL: Record<PieceStatus, string> = {
  idea: "후보",
  selected: "선정",
  evidence_wait: "자료 대기",
  drafted: "작성 중",
  verified: "확인됨",
  in_review: "검수 중",
  approved: "승인",
  published: "발행",
};

/** 구분 표시 — 01 문서 §5: 사실 ■ · 시장 반응 ▲ · 해석 ◆ · 시나리오 ○ */
export const MARK_GLYPH: Record<Mark, string> = { fact: "■", reaction: "▲", view: "◆", scenario: "○" };
export const MARK_LABEL: Record<Mark, string> = { fact: "사실", reaction: "시장 반응", view: "해석", scenario: "시나리오" };
