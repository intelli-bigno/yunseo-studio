// [L7] 편의 구조 칸 — 단 본문(글)만으로는 정본 스키마(01 §4.2~4.4)의 필드를 채울 수 없는 것들.
// 작성 화면은 이 표를 그대로 그린다(칸 이름·종류·설명). 값은 Piece.fields 에 문자열로 둔다(목록 칸은 한 줄에 하나, 열은 「|」로 나눈다).
// 정본 변환(document.ts)이 이 칸을 읽어 post-issue-4/v1·research-5/v1·pre-issue-5/v1 본문을 만든다.
import { EVENT_KINDS } from "../content/pre-issue";
import { RESEARCH_STAGES } from "../content/research";
import type { AuthoringKind } from "./piece-content";

export interface FieldSpec {
  /** Piece.fields 의 키 */
  key: string;
  /** 이 칸을 보일 단 key. null 이면 편 머리(모든 단 공통) */
  stage: string | null;
  label: string;
  /** text 한 줄 · long 여러 줄 글 · list 한 줄에 항목 하나 · select 고르기 */
  type: "text" | "long" | "list" | "select";
  options?: readonly { value: string; label: string }[];
  /** 입력 형식 안내(목록 칸의 열 순서 등) */
  hint?: string;
  /** research 만 — 이 칸이 속한 연구 단계(편이 고른 단계의 칸만 쓴다) */
  researchStage?: string;
}

const EVENT_KIND_LABEL: Record<(typeof EVENT_KINDS)[number], string> = {
  election: "선거",
  central_bank: "중앙은행",
  data_release: "지표 발표",
  policy: "정책",
  speech: "연설",
  other: "기타",
};
const RESEARCH_STAGE_LABEL: Record<(typeof RESEARCH_STAGES)[number], string> = { idea: "아이디어", conditions: "조건", failures: "실패", tool: "도구", follow_up: "후속" };

const eventKind: FieldSpec = { key: "event_kind", stage: null, label: "사건 종류", type: "select", options: EVENT_KINDS.map((v) => ({ value: v, label: EVENT_KIND_LABEL[v] })) };
const timezone: FieldSpec = { key: "timezone", stage: null, label: "사건 시간대 (IANA, 예: America/New_York)", type: "text" };

/** 연구 단계 칸 — key 는 「단계.필드」 */
const r = (stage: (typeof RESEARCH_STAGES)[number], key: string, label: string, type: FieldSpec["type"], hint?: string): FieldSpec => ({ key: `${stage}.${key}`, stage, label, type, researchStage: stage, ...(hint ? { hint } : {}) });

export const KIND_FIELDS: Record<AuthoringKind, readonly FieldSpec[]> = {
  pre: [eventKind, { key: "event_at", stage: null, label: "사건 예정 일시 (YYYY-MM-DDTHH:mm, 사건 현지)", type: "text" }, timezone],
  post: [
    eventKind,
    { key: "event_at", stage: null, label: "사건 일시 (YYYY-MM-DDTHH:mm, 사건 현지)", type: "text" },
    timezone,
    { key: "result_vs_expectation.actual_result", stage: "result_vs_expectation", label: "실제 결과", type: "long" },
    { key: "result_vs_expectation.expectation_gap", stage: "result_vs_expectation", label: "예상과의 차이", type: "long" },
    { key: "judgment_update.items", stage: "judgment_update", label: "판단 갱신 (한 줄에 하나)", type: "list", hint: "유지|수정|폐기 | 이전 판단 | 이유 | 근거 문장 id(쉼표, 선택)" },
    { key: "next_variables.items", stage: "next_variables", label: "다음 변수 (한 줄에 하나)", type: "list", hint: "변수 | 왜 보나 | 볼 곳 | 언제(선택)" },
  ],
  research: [
    { key: "stage", stage: null, label: "이 편의 연구 단계 (한 편 = 한 단계)", type: "select", options: RESEARCH_STAGES.map((v) => ({ value: v, label: RESEARCH_STAGE_LABEL[v] })) },
    { key: "thread_topic", stage: null, label: "스레드 주제 (비우면 제목)", type: "text" },
    { key: "thread_id", stage: null, label: "스레드 id (같은 주제 편끼리 같게, 비우면 편 id)", type: "text" },
    r("idea", "hypothesis", "가설 한 문장", "long"),
    r("idea", "falsifier", "무엇이 보이면 틀리나", "long"),
    r("conditions", "applies_when", "쓰는 때 (한 줄에 하나)", "list"),
    r("conditions", "not_when", "쓰지 않는 때 (한 줄에 하나)", "list"),
    r("conditions", "risk_limits", "리스크 한도", "long"),
    r("failures", "cases", "실패 사례 (한 줄에 하나)", "list", "사례 | 무슨 일 | 왜 | 바꾼 것"),
    r("tool", "name", "도구 이름", "text"),
    r("tool", "purpose", "목적", "long"),
    r("tool", "how_to_use", "사용법 (한 줄에 한 단계)", "list"),
    r("tool", "inputs", "입력", "text"),
    r("tool", "outputs", "출력", "text"),
    r("tool", "limits", "적용 조건과 한계", "long"),
    r("tool", "verified_scope", "실제로 검증한 범위", "long"),
    r("tool", "applies_when", "쓰는 때 (한 줄에 하나)", "list"),
    r("tool", "not_when", "쓰지 않는 때 (한 줄에 하나)", "list"),
    r("follow_up", "tested", "무엇을 시험했나", "long"),
    r("follow_up", "scope", "범위 (기간·표본·시장·비용 가정)", "long"),
    r("follow_up", "result_summary", "결과 요약", "long"),
    r("follow_up", "still_unknown", "아직 모르는 것", "long"),
    r("follow_up", "changes_to_earlier", "이전 단계에서 바뀐 것 (한 줄에 하나, 선택)", "list"),
  ],
};

/** 칸 값 정리 — 모르는 키·고를 수 없는 값은 오류, 빈 값은 지운다 */
export function normalizeFields(kind: AuthoringKind, fields: Readonly<Record<string, string>>): { fields: Record<string, string>; issues: string[] } {
  const specs = new Map(KIND_FIELDS[kind].map((s) => [s.key, s]));
  const out: Record<string, string> = {};
  const issues: string[] = [];
  for (const [key, raw] of Object.entries(fields)) {
    const spec = specs.get(key);
    if (!spec) {
      issues.push(`모르는 칸: ${key}`);
      continue;
    }
    if (typeof raw !== "string") {
      issues.push(`${spec.label}: 글이어야 함`);
      continue;
    }
    const value = spec.type === "list" ? listLines(raw).join("\n") : raw.trim();
    if (!value) continue;
    if (spec.type === "select" && !spec.options?.some((o) => o.value === value)) issues.push(`${spec.label}: 고를 수 없는 값 ${value}`);
    out[key] = value;
  }
  return { fields: out, issues };
}

/** 목록 칸 → 줄 */
export function listLines(value: string | undefined): string[] {
  return (value ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/** 목록 한 줄 → 열(「|」) */
export function listColumns(line: string): string[] {
  return line.split("|").map((c) => c.trim());
}
