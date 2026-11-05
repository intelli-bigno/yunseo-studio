// 이슈 이후(post-issue-4) → 카드: 표지 + 4단(첫 단은 최대 세 장) + 출처. 내용이 없는 장은 그리지 않는다.
import type { PostIssueCard } from "@yunseo/domain";
import { humanize, nextLine, qa, sourcesPage } from "./common";
import type { CardPage, PlanContext } from "./types";

export function planPostIssue(card: PostIssueCard, ctx: PlanContext): CardPage[] {
  const { s } = ctx;
  const st = card.stages;
  const r = st.result_vs_expectation;
  const q = (slot: string, index = 0) => ctx.page(slot, index).q;

  const pages: CardPage[] = [{ slot: "cover", kind: "cover", title: card.cover.title, blocks: [] }];

  // 이 단 안에서 다음에 올 장의 질문 — 내용이 없는 장은 건너뛴다
  const resultFollowers = [
    r.scenario_outcomes.length > 0 ? q("result_vs_expectation", 1) : null,
    r.check_results.length > 0 ? q("result_vs_expectation", 2) : null,
  ].filter((x): x is string => x !== null);

  pages.push({
    slot: "result_vs_expectation",
    kind: "qa",
    ...qa(ctx, "result_vs_expectation", 0, r.headline),
    blocks: [
      { t: "para", marker: "fact", text: r.actual_result },
      { t: "para", marker: "view", text: r.expectation_gap },
      ...(card.links.pre_issue_id === null ? [{ t: "para" as const, marker: "view" as const, text: s.noPriorScenarios }] : []),
      ...nextLine(ctx, resultFollowers[0] ?? q("market_reaction")),
    ],
  });
  if (r.scenario_outcomes.length > 0) {
    pages.push({
      slot: "result_vs_expectation-2",
      kind: "qa",
      ...qa(ctx, "result_vs_expectation", 1, null),
      blocks: [
        { t: "box", rows: r.scenario_outcomes.map((x, i) => ({ n: i + 1, title: humanize(x.scenario_id), text: `${s.outcome[x.outcome]}. ${x.note}` })) },
        ...nextLine(ctx, resultFollowers[1] ?? q("market_reaction")),
      ],
    });
  }
  if (r.check_results.length > 0) {
    pages.push({
      slot: "result_vs_expectation-3",
      kind: "qa",
      ...qa(ctx, "result_vs_expectation", 2, null),
      blocks: [
        { t: "checks", items: r.check_results.map((x) => ({ title: `${humanize(x.check_id)}: ${s.checkStatus[x.status]}`, hint: x.note })) },
        ...nextLine(ctx, q("market_reaction")),
      ],
    });
  }
  pages.push({
    slot: "market_reaction",
    kind: "qa",
    ...qa(ctx, "market_reaction", 0, st.market_reaction.headline),
    blocks: [...st.market_reaction.points.map((text) => ({ t: "para" as const, marker: "market" as const, text })), ...nextLine(ctx, q("judgment_update"))],
  });
  pages.push({
    slot: "judgment_update",
    kind: "qa",
    ...qa(ctx, "judgment_update", 0, st.judgment_update.headline),
    blocks: [
      { t: "box", rows: st.judgment_update.items.map((x, i) => ({ n: i + 1, title: x.judgment, text: `${s.judgment[x.status]}. ${x.reason}` })) },
      ...nextLine(ctx, q("next_variables")),
    ],
  });
  pages.push({
    slot: "next_variables",
    kind: "qa",
    ...qa(ctx, "next_variables", 0, st.next_variables.headline),
    blocks: [{ t: "box", rows: st.next_variables.items.map((x, i) => ({ n: i + 1, title: x.variable, text: [x.why, x.where, x.when].filter((t): t is string => t !== undefined).join(" · ") })) }],
  });
  pages.push(sourcesPage(card, ctx));
  return pages;
}
