// 게시 계획(dry-run) 포트 — 실제 호출은 하지 않는다. 어댑터는 「무엇을 어떤 순서로 부를지」만 계획으로 만든다.
import type { PublishPlan, PublishPlanRequest } from "@yunseo/domain";
import type { CardRenderResult, RenderedFile, ReelResult } from "../pipeline/contracts";

export type InstagramPlanRequest = Extract<PublishPlanRequest, { platform: "instagram" }>;
export type YoutubePlanRequest = Extract<PublishPlanRequest, { platform: "youtube" }>;

export interface InstagramPublishPlanner {
  plan(request: InstagramPlanRequest): PublishPlan;
}

export interface YoutubePublishPlanner {
  plan(request: YoutubePlanRequest): PublishPlan;
}

/** 한 편의 렌더 산출물 — 카드(L1)·릴스(L3) 결과를 계약 타입 그대로 받는다 */
export interface PublishSource {
  cards(pieceId: string): Promise<CardRenderResult | null>;
  reel(pieceId: string): Promise<ReelResult | null>;
  /** 이미지를 직접 열어 잰 크기. 없으면 렌더 계약(1080x1350)을 가정한다 */
  imageSize?(file: RenderedFile): Promise<{ width: number; height: number } | null>;
}
