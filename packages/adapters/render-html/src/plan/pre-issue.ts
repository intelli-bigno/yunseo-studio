// 이슈 이전(pre-issue-5) → 카드: 표지 + 5단(시나리오는 두 장) + 출처 = 8장. 시각 문법은 카드 예시 v2 (docs/design/card-reference/v2).
import type { PreIssueCard } from "@yunseo/domain";
import { nextLine, qa, sourcesPage, unique } from "./common";
import type { CardPage, PlanContext } from "./types";

export function planPreIssue(card: PreIssueCard, ctx: PlanContext): CardPage[] {
  const { s } = ctx;
  const st = card.stages;
  const q = (slot: string, index = 0) => ctx.page(slot, index).q;

  const cover: CardPage = { slot: "cover", kind: "cover", title: card.cover.title, blocks: [] };

  const why: CardPage = {
    slot: "why_it_matters",
    kind: "qa",
    ...qa(ctx, "why_it_matters", 0, st.why_it_matters.headline),
    blocks: [...st.why_it_matters.points.map((text) => ({ t: "para" as const, marker: "view" as const, text })), ...nextLine(ctx, q("market_expectation"))],
  };
  const expectation: CardPage = {
    slot: "market_expectation",
    kind: "qa",
    ...qa(ctx, "market_expectation", 0, st.market_expectation.headline),
    blocks: [...st.market_expectation.points.map((text) => ({ t: "para" as const, marker: "view" as const, text })), ...nextLine(ctx, q("scenarios"))],
  };
  const conditions: CardPage = {
    slot: "scenarios",
    kind: "qa",
    ...qa(ctx, "scenarios", 0, st.scenarios.headline),
    blocks: [
      { t: "box", rows: st.scenarios.items.map((x, i) => ({ n: i + 1, title: x.label, text: x.condition })) },
      { t: "para", marker: "scenario", text: s.conditionsNote },
      ...nextLine(ctx, q("scenarios", 1)),
    ],
  };
  const readings: CardPage = {
    slot: "scenarios-2",
    kind: "qa",
    ...qa(ctx, "scenarios", 1, null),
    blocks: [
      { t: "box", rows: st.scenarios.items.map((x, i) => ({ n: i + 1, text: x.reading })) },
      { t: "para", marker: "view", text: s.readingsNote },
      ...nextLine(ctx, q("transmission")),
    ],
  };
  const transmission: CardPage = {
    slot: "transmission",
    kind: "qa",
    ...qa(ctx, "transmission", 0, st.transmission.headline),
    blocks: [
      { t: "box", rows: st.transmission.paths.map((x, i) => ({ n: i + 1, title: x.channel, text: x.via })) },
      { t: "para", marker: "view", text: s.landsOn(unique(st.transmission.paths.flatMap((x) => x.touches)).join(", ")) },
      ...nextLine(ctx, q("after_checks")),
    ],
  };
  const checks: CardPage = {
    slot: "after_checks",
    kind: "qa",
    ...qa(ctx, "after_checks", 0, st.after_checks.headline),
    blocks: [
      { t: "checks", items: st.after_checks.checks.map((x) => ({ title: x.what, hint: x.where })) },
      ...(st.after_checks.closing === undefined ? [] : [{ t: "close" as const, text: st.after_checks.closing }]),
    ],
  };
  return [cover, why, expectation, conditions, readings, transmission, checks, sourcesPage(card, ctx, [{ t: "banner", text: s.followUp }])];
}
