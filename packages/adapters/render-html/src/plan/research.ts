// 트레이딩 연구(research-5) → 카드: 표지 + 그 편의 한 단계(도구는 두 장) + 출처.
import type { ResearchPost } from "@yunseo/domain";
import { qa, sourcesPage } from "./common";
import type { Block, BoxRow, CardPage, PlanContext } from "./types";

const labelled = (label: string, text: string): string => `**${label}.** ${text}`;

export function planResearch(post: ResearchPost, ctx: PlanContext): CardPage[] {
  const { s } = ctx;
  const cover: CardPage = { slot: "cover", kind: "cover", title: post.cover.title, blocks: [] };
  const page = (slot: string, index: number, headline: string | null, blocks: Block[]): CardPage => ({ slot: index === 0 ? slot : `${slot}-${index + 1}`, kind: "qa", ...qa(ctx, slot, index, headline), blocks });
  const rows = (items: readonly string[], title?: string): BoxRow[] => items.map((text) => (title === undefined ? { text } : { title, text }));

  let body: CardPage[] = [];
  switch (post.stage) {
    case "idea": {
      const x = post.stages.idea;
      body = [page("idea", 0, x.headline, [{ t: "box", rows: [{ n: 1, title: s.hypothesis, text: x.hypothesis }, { n: 2, title: s.falsifier, text: x.falsifier }] }])];
      break;
    }
    case "conditions": {
      const x = post.stages.conditions;
      body = [
        page("conditions", 0, x.headline, [
          { t: "box", rows: [...rows(x.applies_when, s.useWhen), ...rows(x.not_when, s.skipWhen)] },
          { t: "close", text: labelled(s.riskLimits, x.risk_limits) },
        ]),
      ];
      break;
    }
    case "failures": {
      const x = post.stages.failures;
      body = [
        page("failures", 0, x.headline, [
          { t: "box", rows: x.cases.map((c, i) => ({ n: i + 1, title: c.case, text: `${c.what_happened} ${s.why}: ${c.why} ${s.changed}: ${c.what_changed}` })) },
        ]),
      ];
      break;
    }
    case "tool": {
      const x = post.stages.tool;
      body = [
        page("tool", 0, x.headline, [
          { t: "para", marker: "view", text: `**${x.name}.** ${x.purpose}` },
          { t: "box", rows: x.how_to_use.map((text, i) => ({ n: i + 1, text })) },
          { t: "para", text: `${s.inputs}: ${x.inputs} · ${s.outputs}: ${x.outputs}` },
        ]),
        page("tool", 1, null, [
          { t: "box", rows: [...(x.limits === null ? [] : [{ title: s.limits, text: x.limits }]), ...(x.verified_scope === null ? [] : [{ title: s.verifiedScope, text: x.verified_scope }])] },
          ...x.applies_when.map((text): Block => ({ t: "para", marker: "view", text: labelled(s.useWhen, text) })),
          ...x.not_when.map((text): Block => ({ t: "para", marker: "view", text: labelled(s.skipWhen, text) })),
          ...(x.distribution_note === undefined ? [] : [{ t: "para" as const, text: x.distribution_note }]),
        ]),
      ];
      break;
    }
    case "follow_up": {
      const x = post.stages.follow_up;
      body = [
        page("follow_up", 0, x.headline, [
          {
            t: "box",
            rows: [
              { title: s.tested, text: x.tested },
              { title: s.scope, text: x.scope },
              { title: s.result, text: x.result_summary },
              { title: s.stillUnknown, text: x.still_unknown },
            ],
          },
          ...(x.changes_to_earlier.length === 0 ? [] : [{ t: "close" as const, text: labelled(s.changesEarlier, x.changes_to_earlier.join("; ")) }]),
        ]),
      ];
      break;
    }
  }
  return [cover, ...body, sourcesPage(post, ctx)];
}
