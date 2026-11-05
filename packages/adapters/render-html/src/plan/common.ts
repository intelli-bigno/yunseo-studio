// 종마다 같은 카드 조각 — 출처 장, 질문 말풍선 줄 잇기, 낱말 다듬기.
import type { Claim, ContentBody } from "@yunseo/domain";
import { plainText } from "@yunseo/domain";
import type { Block, CardPage, Marker, PlanContext, SourceRow } from "./types";

/** 질문(Q)과 답 띠(A)를 정한다. 첫 장의 답은 정본의 headline 이 우선하고, 둘째 장부터는 프리셋의 기본 답을 쓴다 */
export function qa(ctx: PlanContext, slot: string, index: number, headline: string | null): { question: string; answer: string } {
  const page = ctx.page(slot, index);
  return { question: page.q, answer: (index === 0 ? headline : null) ?? page.a ?? headline ?? "" };
}

/** 다음 장의 질문을 안내하는 강조색 한 줄 */
export function nextLine(ctx: PlanContext, nextQuestion: string | null): Block[] {
  return nextQuestion === null ? [] : [{ t: "para", text: ctx.s.next(nextQuestion), next: true }];
}

/** `close-to-baseline` → `Close to baseline` */
export function humanize(id: string): string {
  const text = id.replace(/[-_]+/g, " ").trim();
  return text === "" ? id : text.charAt(0).toUpperCase() + text.slice(1);
}

export function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

const MARKER_OF: Record<NonNullable<Claim["kind"]>, Marker> = { fact: "fact", market_reaction: "market", interpretation: "view", scenario: "scenario" };
const CITED = new Set<Claim["kind"]>([undefined, "fact", "market_reaction"]);
const MAX_SOURCE_ROWS = 4;

function sourceRow(c: Claim, s: PlanContext["s"]): SourceRow {
  const kind = c.kind === undefined ? "fact" : c.kind;
  let who = c.publisher;
  if (who === undefined && c.source_url !== undefined) {
    try {
      who = new URL(c.source_url).hostname.replace(/^www\./, "");
    } catch {
      who = undefined;
    }
  }
  const parts = [who ?? s.sourceNeeded, c.accessed_at === undefined ? null : `${s.accessed} ${c.accessed_at}`, c.as_of === undefined ? null : `${s.asOf} ${c.as_of}`];
  return { marker: MARKER_OF[kind], title: plainText(c.text), detail: parts.filter((p): p is string => p !== null).join(" · ") };
}

/**
 * 출처 장 — 인용한 claim(사실·시장 반응)을 한 줄씩. 없으면 범례(■▲◆○)를 보인다.
 * 운영자 해석은 있으면 본문으로, 없으면 점선 자리로. 고지 문구가 확정되지 않았으면 점선 자리로 둔다.
 */
export function sourcesPage(body: ContentBody, ctx: PlanContext, tail: Block[] = []): CardPage {
  const { s } = ctx;
  const cited = body.claims.filter((c) => CITED.has(c.kind));
  const rows: SourceRow[] =
    cited.length > 0
      ? cited.slice(0, MAX_SOURCE_ROWS).map((c) => sourceRow(c, s))
      : (["fact", "market"] as const).map((m) => ({ marker: m, title: s.legend[m].title, detail: s.legend[m].none }));
  if (cited.length > MAX_SOURCE_ROWS) rows.push({ marker: "fact", title: s.moreClaims(cited.length - MAX_SOURCE_ROWS), detail: "" });
  rows.push({ marker: "view", title: s.legend.view.title, detail: s.legend.view.none, note: s.legendNote }, { marker: "scenario", title: s.legend.scenario.title, detail: s.legend.scenario.none });

  const blocks: Block[] = [{ t: "sources", rows }];
  if (body.operator_view !== null) blocks.push({ t: "para", marker: "view", text: `**${s.viewTitle}.** ${body.operator_view}` });
  else blocks.push({ t: "placeholder", text: s.viewMissing });
  const draft = body.status === "draft";
  const disclosure = ctx.disclosure ?? s.disclosureTbd;
  blocks.push({ t: "placeholder", text: draft || ctx.disclosure === null ? `${disclosure}${draft ? ` · ${s.statusDraft}` : ""}` : disclosure });
  blocks.push(...tail);
  const { question, answer } = qa(ctx, "sources", 0, null);
  return { slot: "sources", kind: "sources", question, answer, blocks };
}
