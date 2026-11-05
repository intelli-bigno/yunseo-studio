// 캡션·해시태그 — 콘텐츠 정본에서 결정적으로 만든다(같은 입력 → 같은 글, LLM 없음).
// 기준 시점·출처 안내·「투자 권유 아님」 고지를 반드시 넣고, Instagram 한도(캡션 2,200자·해시태그 30개)를 검사한다.
// 고지 문구는 아직 사람이 확정하지 않았다(결정 D8) — 기본 문구는 초안이고, 그때는 결과 경고에 남긴다.
import { findBannedExpressions, type BannedExpressionRule } from "../compliance/expressions";
import type { ContentFinding } from "./claims";
import { plainText } from "./envelope";
import type { ContentBody } from "./document";
import { POST_ISSUE_SCHEMA } from "./post-issue";
import { PRE_ISSUE_SCHEMA } from "./pre-issue";
import { RESEARCH_SCHEMA } from "./research";

/** Instagram 캡션 상한(글자). 해시태그도 캡션 안에 들어간다 */
export const CAPTION_MAX_CHARS = 2200;
/** Instagram 해시태그 상한 */
export const HASHTAG_MAX = 30;
/** 이 저장소가 붙이는 해시태그 수 — 상한보다 훨씬 적게 쓴다(많이 붙이는 것이 목적이 아니다) */
export const HASHTAG_TARGET = 8;

export interface PublishTextOptions {
  /** 확정된 고지 문구. 없으면 언어별 초안 문구를 쓰고 경고를 남긴다 */
  disclosure?: string | null;
  /** 카드 장수 — 「출처는 마지막(N번째) 카드」 안내용 */
  cardCount: number;
}

export interface PublishText {
  caption: string;
  hashtags: string[];
  warnings: string[];
}

interface Labels {
  asOf: string;
  asOfMissing: string;
  sources: string;
  noSources: string;
  lastCard: (n: number) => string;
  disclosure: string;
  tags: { generic: string[]; type: Record<ContentBody["type"], string[]>; stage: Record<string, string>; kind: Record<string, string> };
}

const EN: Labels = {
  asOf: "As of",
  asOfMissing: "As of [not set]",
  sources: "Sources",
  noSources: "No figures are cited in this post",
  lastCard: (n) => `full list on card ${n}`,
  disclosure: "For education only. Not investment advice.",
  tags: {
    generic: ["Markets", "Investing"],
    type: {
      pre_issue: ["EventPreview", "MarketScenarios"],
      post_issue: ["MarketRecap", "WhatChanged"],
      research: ["TradingResearch", "MarketStructure"],
    },
    stage: { idea: "TradingIdeas", conditions: "RiskManagement", failures: "TradingReview", tool: "TradingTools", follow_up: "ResearchFollowUp" },
    kind: { election: "Elections", central_bank: "CentralBanks", data_release: "EconomicData", policy: "PolicyWatch", speech: "Speeches" },
  },
};

const KO: Labels = {
  asOf: "기준 시점",
  asOfMissing: "기준 시점 [미입력]",
  sources: "출처",
  noSources: "이 게시물에는 인용한 수치가 없습니다",
  lastCard: (n) => `전체 목록은 ${n}번째 카드`,
  disclosure: "정보 제공·교육 목적이며 투자 권유가 아닙니다.",
  tags: {
    generic: ["시장", "투자"],
    type: {
      pre_issue: ["이벤트프리뷰", "시장시나리오"],
      post_issue: ["시장복기", "무엇이달라졌나"],
      research: ["트레이딩연구", "시장구조"],
    },
    stage: { idea: "트레이딩아이디어", conditions: "리스크관리", failures: "매매복기", tool: "트레이딩도구", follow_up: "후속검증" },
    kind: { election: "선거", central_bank: "중앙은행", data_release: "경제지표발표", policy: "정책", speech: "연설" },
  },
};

function labelsFor(language: string): { labels: Labels; fallback: boolean } {
  if (language.startsWith("ko")) return { labels: KO, fallback: false };
  return { labels: EN, fallback: !language.startsWith("en") };
}

/** 단어들을 붙여 해시태그 한 낱말로 — `US midterm elections` → `USMidtermElections`. 글자·숫자만 남긴다 */
export function tagify(text: string): string {
  return plainText(text)
    .normalize("NFKC")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w !== "")
    .map((w) => (/^[a-z]/.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join("");
}

function subjectOf(body: ContentBody): string {
  switch (body.schema) {
    case PRE_ISSUE_SCHEMA:
    case POST_ISSUE_SCHEMA:
      return body.event.name;
    case RESEARCH_SCHEMA:
      return body.stage === "tool" ? body.stages.tool.name : body.thread.topic;
  }
}

function kindTag(body: ContentBody, labels: Labels): string | undefined {
  if (body.schema === RESEARCH_SCHEMA) return labels.tags.stage[body.stage];
  return labels.tags.kind[body.event.kind];
}

export function buildHashtags(body: ContentBody, language: string): string[] {
  const { labels } = labelsFor(language);
  const candidates = [subjectOf(body), kindTag(body, labels) ?? "", ...labels.tags.type[body.type], ...labels.tags.generic];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const word of candidates) {
    const tag = tagify(word);
    // 너무 긴 낱말(한 문장을 통째로 붙인 태그)은 읽히지 않는다
    if (tag === "" || [...tag].length > 40 || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    tags.push(`#${tag}`);
    if (tags.length >= HASHTAG_TARGET) break;
  }
  return tags;
}

/** 본문 요약 줄 — 단별 headline (연구 편은 headline 하나). 문장을 새로 쓰지 않고 정본의 문구를 그대로 쓴다 */
function summaryLines(body: ContentBody): string[] {
  switch (body.schema) {
    case PRE_ISSUE_SCHEMA: {
      const s = body.stages;
      return [s.why_it_matters, s.market_expectation, s.scenarios, s.transmission, s.after_checks].map((x) => x.headline);
    }
    case POST_ISSUE_SCHEMA: {
      const s = body.stages;
      return [s.result_vs_expectation, s.market_reaction, s.judgment_update, s.next_variables].map((x) => x.headline);
    }
    case RESEARCH_SCHEMA:
      return [(body.stages as Record<string, { headline: string }>)[body.stage]?.headline ?? ""].filter((t) => t !== "");
  }
}

/** 출처 안내에 쓰는 발행처 — publisher 가 없으면 URL 의 호스트. 중복 제거, 등장 순서 유지 */
export function publishersOf(body: ContentBody): string[] {
  const names: string[] = [];
  for (const c of body.claims) {
    if (c.kind === "interpretation" || c.kind === "scenario") continue;
    let name = c.publisher;
    if (name === undefined && c.source_url !== undefined) {
      try {
        name = new URL(c.source_url).hostname.replace(/^www\./, "");
      } catch {
        name = undefined;
      }
    }
    if (name !== undefined && !names.includes(name)) names.push(name);
  }
  return names;
}

export function buildPublishText(body: ContentBody, options: PublishTextOptions): PublishText {
  const warnings: string[] = [];
  const { labels, fallback } = labelsFor(body.language);
  if (fallback) warnings.push(`캡션 문구가 ${body.language} 를 지원하지 않아 영어 문구를 썼다`);

  const disclosure = options.disclosure ?? null;
  if (disclosure === null) warnings.push("고지 문구는 초안(결정 D8 미확정) — 확정 문구로 교체해야 게시할 수 있다");

  const hashtags = buildHashtags(body, body.language);
  const publishers = publishersOf(body);
  const asOf = body.as_of === null ? labels.asOfMissing : `${labels.asOf} ${body.as_of}`;
  const sources = publishers.length > 0 ? `${labels.sources}: ${publishers.join(", ")} (${labels.lastCard(options.cardCount)})` : `${labels.sources}: ${labels.noSources}`;

  const head = [plainText(body.cover.title), plainText(body.cover.hook)];
  const bullets = summaryLines(body).map((t) => `• ${plainText(t)}`);
  const tail = [`${asOf}. ${sources}`, disclosure ?? labels.disclosure];
  const render = (b: readonly string[]) => [...head, ...(b.length > 0 ? [b.join("\n")] : []), tail.join("\n"), hashtags.join(" ")].join("\n\n");

  let kept = bullets;
  let caption = render(kept);
  // 한도를 넘으면 요약 줄을 뒤에서부터 덜어 낸다 (제목·기준 시점·출처·고지·태그는 지키지 않을 수 없다)
  while ([...caption].length > CAPTION_MAX_CHARS && kept.length > 0) {
    kept = kept.slice(0, -1);
    caption = render(kept);
  }
  if (kept.length < bullets.length) warnings.push(`캡션이 ${CAPTION_MAX_CHARS}자를 넘어 요약 ${bullets.length - kept.length}줄을 덜어 냈다`);
  return { caption, hashtags, warnings };
}

const HASHTAG_SHAPE = /^#[\p{L}\p{N}_]+$/u;

/** 캡션·해시태그 검사 — 한도(2,200자·30개), 태그 모양, 캡션 본문의 금지 표현 */
export function publishTextFindings(text: PublishText, rules: readonly BannedExpressionRule[]): ContentFinding[] {
  const out: ContentFinding[] = [];
  const length = [...text.caption].length;
  if (length > CAPTION_MAX_CHARS) out.push({ severity: "block", code: "caption_limit", path: "caption", message: `${length}자 > Instagram 캡션 상한 ${CAPTION_MAX_CHARS}자` });
  if (text.hashtags.length > HASHTAG_MAX) out.push({ severity: "block", code: "caption_limit", path: "hashtags", message: `${text.hashtags.length}개 > Instagram 해시태그 상한 ${HASHTAG_MAX}개` });
  text.hashtags.forEach((tag, i) => {
    if (!HASHTAG_SHAPE.test(tag)) out.push({ severity: "block", code: "caption_limit", path: `hashtags[${i}]`, message: `해시태그 모양이 아니다: ${tag}` });
  });
  for (const hit of findBannedExpressions(text.caption, "body", rules)) {
    out.push({ severity: hit.severity, code: "banned_expression", path: "caption", message: `금지 표현 「${hit.matched}」 (${hit.ruleId})` });
  }
  return out;
}
