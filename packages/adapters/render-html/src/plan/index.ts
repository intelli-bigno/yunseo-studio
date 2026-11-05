import type { ContentBody } from "@yunseo/domain";
import { planPostIssue } from "./post-issue";
import { planPreIssue } from "./pre-issue";
import { planResearch } from "./research";
import type { CardPage, PlanContext } from "./types";

export * from "./types";

/** 콘텐츠 정본 한 편 → 카드 계획(게시 순서). 종마다 계획이 다르고 레이아웃은 하나다 */
export function planCards(body: ContentBody, ctx: PlanContext): CardPage[] {
  switch (body.schema) {
    case "pre-issue-5/v1":
      return planPreIssue(body, ctx);
    case "post-issue-4/v1":
      return planPostIssue(body, ctx);
    case "research-5/v1":
      return planResearch(body, ctx);
  }
}
