// 콘텐츠 정본 스키마 — 「이슈 이전」 5단 카드 (포맷 pre-issue-5).
// 파일(YAML) 필드 이름을 그대로 쓴다(snake_case) — 사본·변환 층을 두지 않는다 (docs/01-content-sot.md).
import { Issues, type ValidationResult } from "../validation";
import { findBannedExpressions, type BannedExpressionRule, type ExpressionHit } from "../compliance/expressions";
import { blockFinding, type ContentFinding } from "./claims";
import { envelopeFindings, findingLine, plainText, readEnvelope, unsourcedNumbers, type ContentText, type Envelope } from "./envelope";

export const PRE_ISSUE_SCHEMA = "pre-issue-5/v1";

/** 5단 순서 = 정본. presets/format/pre-issue-5.yaml 의 stages 와 같아야 한다(테스트가 대조). */
export const STAGE_KEYS = [
  "why_it_matters", //     1. 왜 중요한가
  "market_expectation", // 2. 현재 시장은 무엇을 예상하는가
  "scenarios", //          3. 결과별 시나리오
  "transmission", //       4. 어떤 경로로 자산·업종에 영향
  "after_checks", //       5. 발표 이후 무엇을 확인할 것인가
] as const;
export type StageKey = (typeof STAGE_KEYS)[number];

export const EVENT_KINDS = ["election", "central_bank", "data_release", "policy", "speech", "other"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export interface Scenario {
  /** 이후 편(post-issue-4)의 scenario_outcomes 가 가리키는 안정 키. 없으면 label 로 연결한다 */
  id?: string;
  label: string;
  condition: string;
  reading: string;
}
export interface TransmissionPath {
  channel: string;
  via: string;
  touches: string[];
}
export interface AfterCheck {
  /** 이후 편의 check_results 가 가리키는 안정 키 */
  id?: string;
  what: string;
  where: string;
}

export interface PreIssueCard extends Envelope {
  schema: typeof PRE_ISSUE_SCHEMA;
  type: "pre_issue";
  event: {
    name: string;
    kind: EventKind;
    /** ISO 8601 (UTC 저장). draft 에서만 null 허용. */
    scheduled_at: string | null;
    /** IANA 시간대 표시용. draft 에서만 null 허용. */
    timezone: string | null;
  };
  cover: { title: string; hook: string };
  stages: {
    why_it_matters: { headline: string; points: string[] };
    market_expectation: { headline: string; points: string[] };
    scenarios: { headline: string; items: Scenario[] };
    transmission: { headline: string; paths: TransmissionPath[] };
    /** closing: 독자가 손에 쥘 것을 한 문장으로 닫는 칸(선택) */
    after_checks: { headline: string; checks: AfterCheck[]; closing?: string };
  };
}

export function validatePreIssueCard(input: unknown): ValidationResult<PreIssueCard> {
  const e = new Issues();
  const root = e.record(input, "$");
  if (root["schema"] !== PRE_ISSUE_SCHEMA) e.add("schema", `${PRE_ISSUE_SCHEMA} 여야 한다`);

  const event = e.record(root["event"], "event");
  const cover = e.record(root["cover"], "cover");
  const stages = e.record(root["stages"], "stages");
  const why = e.record(stages["why_it_matters"], "stages.why_it_matters");
  const expectation = e.record(stages["market_expectation"], "stages.market_expectation");
  const scenarios = e.record(stages["scenarios"], "stages.scenarios");
  const transmission = e.record(stages["transmission"], "stages.transmission");
  const checks = e.record(stages["after_checks"], "stages.after_checks");

  const card: PreIssueCard = {
    schema: PRE_ISSUE_SCHEMA,
    type: "pre_issue",
    ...readEnvelope(e, root, "pre_issue"),
    event: {
      name: e.text(event["name"], "event.name"),
      kind: e.oneOf(event["kind"], EVENT_KINDS, "event.kind", "other"),
      scheduled_at: e.textOrNull(event["scheduled_at"], "event.scheduled_at"),
      timezone: e.textOrNull(event["timezone"], "event.timezone"),
    },
    cover: { title: e.text(cover["title"], "cover.title"), hook: e.text(cover["hook"], "cover.hook") },
    stages: {
      why_it_matters: {
        headline: e.text(why["headline"], "stages.why_it_matters.headline"),
        points: e.textArray(why["points"], "stages.why_it_matters.points", 1),
      },
      market_expectation: {
        headline: e.text(expectation["headline"], "stages.market_expectation.headline"),
        points: e.textArray(expectation["points"], "stages.market_expectation.points", 1),
      },
      scenarios: {
        headline: e.text(scenarios["headline"], "stages.scenarios.headline"),
        // 편집 원칙 2: 시나리오는 항상 둘 이상 (한 방향 예측 금지)
        items: e.array(scenarios["items"], "stages.scenarios.items", 2).map((raw, i) => {
          const p = `stages.scenarios.items[${i}]`;
          const s = e.record(raw, p);
          const item: Scenario = {
            label: e.text(s["label"], `${p}.label`),
            condition: e.text(s["condition"], `${p}.condition`),
            reading: e.text(s["reading"], `${p}.reading`),
          };
          if (s["id"] !== undefined) item.id = e.text(s["id"], `${p}.id`);
          return item;
        }),
      },
      transmission: {
        headline: e.text(transmission["headline"], "stages.transmission.headline"),
        paths: e.array(transmission["paths"], "stages.transmission.paths", 1).map((raw, i) => {
          const p = `stages.transmission.paths[${i}]`;
          const t = e.record(raw, p);
          return {
            channel: e.text(t["channel"], `${p}.channel`),
            via: e.text(t["via"], `${p}.via`),
            touches: e.textArray(t["touches"], `${p}.touches`, 1),
          };
        }),
      },
      after_checks: {
        headline: e.text(checks["headline"], "stages.after_checks.headline"),
        checks: e.array(checks["checks"], "stages.after_checks.checks", 1).map((raw, i) => {
          const p = `stages.after_checks.checks[${i}]`;
          const c = e.record(raw, p);
          const item: AfterCheck = { what: e.text(c["what"], `${p}.what`), where: e.text(c["where"], `${p}.where`) };
          if (c["id"] !== undefined) item.id = e.text(c["id"], `${p}.id`);
          return item;
        }),
        ...(checks["closing"] === undefined ? {} : { closing: e.text(checks["closing"], "stages.after_checks.closing") }),
      },
    },
  };
  return e.result(card);
}

export type CardText = ContentText;

/** 독자에게 보이는 모든 문장과 그 위치. 금지 표현·수치 검사의 공통 입력. 강조 표기(**)는 벗긴다 */
export function collectCardTexts(card: PreIssueCard): CardText[] {
  const s = card.stages;
  const out: CardText[] = [
    { path: "cover.title", text: card.cover.title },
    { path: "cover.hook", text: card.cover.hook },
    { path: "stages.why_it_matters.headline", text: s.why_it_matters.headline },
    ...s.why_it_matters.points.map((text, i) => ({ path: `stages.why_it_matters.points[${i}]`, text })),
    { path: "stages.market_expectation.headline", text: s.market_expectation.headline },
    ...s.market_expectation.points.map((text, i) => ({ path: `stages.market_expectation.points[${i}]`, text })),
    { path: "stages.scenarios.headline", text: s.scenarios.headline },
    { path: "stages.transmission.headline", text: s.transmission.headline },
    { path: "stages.after_checks.headline", text: s.after_checks.headline },
  ];
  s.scenarios.items.forEach((x, i) => {
    const p = `stages.scenarios.items[${i}]`;
    out.push({ path: `${p}.label`, text: x.label }, { path: `${p}.condition`, text: x.condition }, { path: `${p}.reading`, text: x.reading });
  });
  s.transmission.paths.forEach((x, i) => {
    const p = `stages.transmission.paths[${i}]`;
    out.push({ path: `${p}.channel`, text: x.channel }, { path: `${p}.via`, text: x.via });
    x.touches.forEach((text, j) => out.push({ path: `${p}.touches[${j}]`, text }));
  });
  s.after_checks.checks.forEach((x, i) => {
    const p = `stages.after_checks.checks[${i}]`;
    out.push({ path: `${p}.what`, text: x.what }, { path: `${p}.where`, text: x.where });
  });
  if (s.after_checks.closing !== undefined) out.push({ path: "stages.after_checks.closing", text: s.after_checks.closing });
  if (card.operator_view !== null) out.push({ path: "operator_view", text: card.operator_view });
  return out.map((t) => ({ path: t.path, text: plainText(t.text) }));
}

export interface CardExpressionHit extends ExpressionHit {
  path: string;
}

/** 카드 본문 전체를 금지 표현 규칙으로 검사한다 (표면: body). */
export function scanCardExpressions(card: PreIssueCard, rules: readonly BannedExpressionRule[]): CardExpressionHit[] {
  return collectCardTexts(card).flatMap(({ path, text }) =>
    findBannedExpressions(text, "body", rules).map((hit) => ({ ...hit, path })),
  );
}

/** 숫자가 든 본문 문장 중 claims 에 같은 숫자가 없는 것. 수치는 출처 있는 claim 으로만 쓴다 (편집 원칙 3). */
export function findUnsourcedNumbers(card: PreIssueCard): CardText[] {
  return unsourcedNumbers(collectCardTexts(card), card.claims);
}

/** draft → verified 로 올리기 전에 막는 사유(구조화). 비어 있어야 올릴 수 있다. */
export function preIssueFindings(card: PreIssueCard): ContentFinding[] {
  const out: ContentFinding[] = [];
  if (card.event.scheduled_at === null) out.push(blockFinding("verification", "event.scheduled_at", "일시 없는 이벤트는 선정 불가"));
  if (card.event.timezone === null) out.push(blockFinding("verification", "event.timezone", "시간대 명시 필요"));
  out.push(...envelopeFindings(card, collectCardTexts(card), { importance: true }));
  return out;
}

/** draft → verified 로 올리기 전에 막는 사유. 비어 있어야 올릴 수 있다. */
export function verificationBlockers(card: PreIssueCard): string[] {
  return preIssueFindings(card).map(findingLine);
}
