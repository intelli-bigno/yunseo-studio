// 콘텐츠 정본 스키마 — 「이슈 이전」 5단 카드 (포맷 pre-issue-5).
// 파일(YAML) 필드 이름을 그대로 쓴다(snake_case) — 사본·변환 층을 두지 않는다 (docs/01-content-sot.md).
import { Issues, type ValidationResult } from "../validation";
import { findBannedExpressions, type BannedExpressionRule, type ExpressionHit } from "../compliance/expressions";

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

/** draft: 작성 중 / verified: 출처·일시·운영자 해석까지 갖춰 검수 단계로 넘길 수 있음 */
export const CARD_STATUSES = ["draft", "verified"] as const;
export type CardStatus = (typeof CARD_STATUSES)[number];

export interface Claim {
  text: string;
  source_url?: string;
  accessed_at?: string;
  quote?: string;
}
export interface Scenario {
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
  what: string;
  where: string;
}

export interface PreIssueCard {
  schema: typeof PRE_ISSUE_SCHEMA;
  id: string;
  status: CardStatus;
  /** 발행 언어 코드. 프리셋 language 와 같아야 게시 가능(후속). */
  language: string;
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
    after_checks: { headline: string; checks: AfterCheck[] };
  };
  /** 수치·고유명사·날짜가 든 사실 주장 + 출처. 사실 수치를 쓰지 않은 카드는 빈 배열. */
  claims: Claim[];
  /** 운영자 도메인 지식·경험으로 얹는 고유 해석. verified 에서 필수. */
  operator_view: string | null;
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
    id: e.text(root["id"], "id"),
    status: e.oneOf(root["status"], CARD_STATUSES, "status", "draft"),
    language: e.text(root["language"], "language"),
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
          return {
            label: e.text(s["label"], `${p}.label`),
            condition: e.text(s["condition"], `${p}.condition`),
            reading: e.text(s["reading"], `${p}.reading`),
          };
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
          return { what: e.text(c["what"], `${p}.what`), where: e.text(c["where"], `${p}.where`) };
        }),
      },
    },
    claims: e.array(root["claims"], "claims").map((raw, i) => {
      const p = `claims[${i}]`;
      const c = e.record(raw, p);
      const claim: Claim = { text: e.text(c["text"], `${p}.text`) };
      for (const key of ["source_url", "accessed_at", "quote"] as const) {
        if (c[key] !== undefined) claim[key] = e.text(c[key], `${p}.${key}`);
      }
      return claim;
    }),
    operator_view: e.textOrNull(root["operator_view"], "operator_view"),
  };
  return e.result(card);
}

export interface CardText {
  path: string;
  text: string;
}

/** 독자에게 보이는 모든 문장과 그 위치. 금지 표현·수치 검사의 공통 입력. */
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
  if (card.operator_view !== null) out.push({ path: "operator_view", text: card.operator_view });
  return out;
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
  const claimed = new Set(card.claims.flatMap((c) => c.text.match(/\d[\d,.]*/g) ?? []));
  return collectCardTexts(card).filter(({ text }) => {
    const numbers = text.match(/\d[\d,.]*/g) ?? [];
    return numbers.some((n) => !claimed.has(n));
  });
}

/** draft → verified 로 올리기 전에 막는 사유. 비어 있어야 올릴 수 있다. */
export function verificationBlockers(card: PreIssueCard): string[] {
  const blockers: string[] = [];
  if (card.event.scheduled_at === null) blockers.push("event.scheduled_at: 일시 없는 이벤트는 선정 불가");
  if (card.event.timezone === null) blockers.push("event.timezone: 시간대 명시 필요");
  if (card.operator_view === null) blockers.push("operator_view: 운영자 고유 해석이 비어 있다");
  card.claims.forEach((c, i) => {
    if (!c.source_url || !c.accessed_at || !c.quote) {
      blockers.push(`claims[${i}]: 출처(source_url·accessed_at·quote) 누락`);
    }
  });
  for (const t of findUnsourcedNumbers(card)) blockers.push(`${t.path}: 출처 없는 수치`);
  return blockers;
}
