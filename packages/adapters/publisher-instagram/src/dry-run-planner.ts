// Instagram Graph API 게시 계획(dry-run 전용) — 캐러셀·단일 이미지·릴스를 「컨테이너 생성 → (묶음) → 상태 확인 → 게시」 순서의 요청 목록으로 만든다.
// 이 파일에는 네트워크 호출도 토큰·계정 정보 칸도 없다: 계획은 값일 뿐이고, 인증은 needsAuth 표시뿐이다.
// 순서·파라미터·한도의 근거: docs/05-automation.md §5.8 (2026-11-05 공식 문서 실측).
import type { InstagramPublishPlanner, InstagramPlanRequest } from "@yunseo/application";
import {
  GRAPH_API_VERSION,
  INSTAGRAM,
  checkInstagramPost,
  checkInstagramReel,
  composeInstagramCaption,
  isBlocked,
  type BannedExpressionRule,
  type PlanKind,
  type PlanParamValue,
  type PlannedStep,
  type PublishPlan,
  type QuotaForecast,
  type SpecIssue,
} from "@yunseo/domain";

export interface InstagramPlannerOptions {
  /** Facebook 로그인 방식은 graph.facebook.com, Instagram 로그인 방식은 graph.instagram.com */
  apiHost?: "graph.facebook.com" | "graph.instagram.com";
  /** 금지 표현 규칙(프리셋). 조립부가 읽어 넘긴다 */
  bannedExpressions?: readonly BannedExpressionRule[];
}

const jpegName = (name: string) => name.replace(/\.[^./]+$/, "") + ".jpg";
const isJpeg = (name: string) => /\.jpe?g$/i.test(name);

type Params = Record<string, PlanParamValue>;

export function createInstagramDryRunPlanner(options: InstagramPlannerOptions = {}): InstagramPublishPlanner {
  const host = options.apiHost ?? "graph.facebook.com";
  const rules = options.bannedExpressions ?? [];
  const base = `https://${host}/${GRAPH_API_VERSION}`;
  const media = `${base}/<IG_USER_ID>/media`;

  function builder() {
    const steps: PlannedStep[] = [];
    const add = (step: Omit<PlannedStep, "order" | "dependsOn" | "needsAuth" | "params" | "url" | "method"> & Partial<Pick<PlannedStep, "dependsOn" | "needsAuth" | "params" | "url" | "method">>) => {
      steps.push({ order: steps.length + 1, dependsOn: [], needsAuth: false, params: {}, url: null, method: null, ...step });
    };
    return { steps, add };
  }

  const limitCheck = (add: ReturnType<typeof builder>["add"]) =>
    add({
      id: "limit",
      title: "게시 한도 사용량 확인",
      kind: "request",
      method: "GET",
      url: `${base}/<IG_USER_ID>/content_publishing_limit`,
      params: { fields: "quota_usage,config" },
      needsAuth: true,
      note: "24시간 안에 이미 게시한 건수(quota_usage)와 한도(config.quota_total)를 본다 — 문서 간 한도 값이 달라(100/50) 실제 값은 여기서 확인한다.",
    });

  const quotaFor = (containers: number): QuotaForecast[] => [
    {
      label: "컨테이너 생성",
      used: containers,
      limit: INSTAGRAM.limits.containersPer24h,
      unit: "개",
      window: "24시간 이동 구간",
      basis: "IG User Media 참조 — 「An Instagram account can only create 400 containers within a rolling 24 hour period」. 컨테이너는 24시간 뒤 만료",
    },
    {
      label: "API 게시",
      used: 1,
      limit: INSTAGRAM.limits.postsPer24hConservative,
      unit: "건",
      window: "24시간 이동 구간",
      basis: `문서끼리 어긋난다: 게시 가이드 Rate Limit ${INSTAGRAM.limits.postsPer24hGuide}건 / 캐러셀 항목·content_publishing_limit 참조 ${INSTAGRAM.limits.postsPer24hConservative}건 — 낮은 값을 상한으로 쓴다. 캐러셀은 1건`,
    },
  ];

  const finish = (pieceId: string, kind: PlanKind, steps: PlannedStep[], quota: QuotaForecast[], issues: SpecIssue[], summary: string): PublishPlan => ({
    mode: "dry-run",
    platform: "instagram",
    kind,
    pieceId,
    steps,
    quota,
    issues,
    blocked: isBlocked(issues),
    summary,
  });

  function planPost(request: Extract<InstagramPlanRequest, { kind: "post" }>): PublishPlan {
    const { input, pieceId } = request;
    const issues = checkInstagramPost(input, rules);
    const count = input.images.length;
    const caption = composeInstagramCaption(input.caption, input.hashtags);
    const carousel = count >= INSTAGRAM.carousel.minItems;
    const { steps, add } = builder();
    if (count === 0) return finish(pieceId, "ig_carousel", steps, [], issues, "카드 없음");

    limitCheck(add);
    const converted = input.images.filter((i) => !isJpeg(i.name));
    if (converted.length > 0) {
      add({ id: "convert", title: `JPEG(sRGB) 변환 — ${converted.length}장`, kind: "local", params: { files: converted.map((i) => i.name), format: "JPEG (sRGB)" }, note: "PNG 는 허용되지 않는다. 변환 뒤 용량(8MB 이하)을 다시 확인한다." });
    }
    const files = input.images.map((i) => jpegName(i.name));
    add({ id: "host", title: "공개 주소로 올리기", kind: "local", dependsOn: converted.length > 0 ? ["convert"] : [], params: { files }, note: "image_url 은 게시를 시도하는 시점에 누구나 받을 수 있는 서버에 있어야 한다(Meta 가 주소로 가져간다)." });

    const itemIds: string[] = [];
    input.images.forEach((_, i) => {
      const id = `item-${i + 1}`;
      itemIds.push(id);
      const params: Params = { image_url: `<PUBLIC_URL:${files[i]}>` };
      if (carousel) params.is_carousel_item = true;
      else params.caption = caption;
      const alt = input.altTexts[i];
      if (alt) params.alt_text = alt;
      if (!carousel && input.aiGenerated !== null) params.is_ai_generated = input.aiGenerated;
      add({ id, title: carousel ? `항목 컨테이너 ${i + 1}/${count}` : "이미지 컨테이너", kind: "request", method: "POST", url: media, params, dependsOn: ["host"], needsAuth: true });
    });

    let last = itemIds[0]!;
    if (carousel) {
      const params: Params = { media_type: "CAROUSEL", children: itemIds.map((id) => `<ID:${id}>`), caption };
      if (input.aiGenerated !== null) params.is_ai_generated = input.aiGenerated;
      add({ id: "carousel", title: "캐러셀 컨테이너(묶음)", kind: "request", method: "POST", url: media, params, dependsOn: itemIds, needsAuth: true, note: "캡션·AI 표시는 항목이 아니라 이 묶음 컨테이너에만 건다. 모든 장은 첫 장 비율로 잘린다." });
      last = "carousel";
    }
    add({
      id: "status",
      title: "컨테이너 상태 확인",
      kind: "request",
      method: "GET",
      url: `${base}/<CONTAINER_ID:${last}>`,
      params: { fields: "status_code", poll_every_sec: INSTAGRAM.limits.statusPollIntervalSec, poll_max_sec: INSTAGRAM.limits.statusPollMaxSec },
      dependsOn: [last],
      needsAuth: true,
      note: "FINISHED 가 되면 게시한다(EXPIRED·ERROR 면 중단). 문서는 영상 컨테이너 기준으로 적었지만 확인 뒤 게시하는 것이 안전하다.",
    });
    add({
      id: "publish",
      title: "게시",
      kind: "request",
      method: "POST",
      url: `${base}/<IG_USER_ID>/media_publish`,
      params: { creation_id: `<ID:${last}>` },
      dependsOn: ["status"],
      needsAuth: true,
      note: "사람의 승인(G3) 뒤에만 호출한다. API 에는 예약 시각 파라미터가 문서에 없어 우리 스케줄러가 게시 시각에 이 호출을 한다.",
    });

    const containers = count + (carousel ? 1 : 0);
    const summary = `카드 ${count}장 · 캡션 ${[...caption].length}자(해시태그 포함) · 컨테이너 ${containers}개 · 게시 1건`;
    return finish(pieceId, carousel ? "ig_carousel" : "ig_image", steps, quotaFor(containers), issues, summary);
  }

  function planReel(request: Extract<InstagramPlanRequest, { kind: "reel" }>): PublishPlan {
    const { input, pieceId } = request;
    const issues = checkInstagramReel(input, rules);
    const caption = composeInstagramCaption(input.caption, input.hashtags);
    const { steps, add } = builder();
    limitCheck(add);
    add({
      id: "host",
      title: "공개 주소로 올리기",
      kind: "local",
      params: { files: [input.video.name, ...(input.cover ? [jpegName(input.cover.name)] : [])] },
      note: "video_url 은 공개 주소여야 한다. 로컬 파일은 재개 가능한 업로드(rupload.facebook.com, upload_type=resumable)로 올릴 수도 있다.",
    });
    const params: Params = { media_type: "REELS", video_url: `<PUBLIC_URL:${input.video.name}>`, caption, share_to_feed: input.shareToFeed };
    if (input.cover) params.cover_url = `<PUBLIC_URL:${jpegName(input.cover.name)}>`;
    if (input.aiGenerated !== null) params.is_ai_generated = input.aiGenerated;
    add({ id: "reel", title: "릴스 컨테이너", kind: "request", method: "POST", url: media, params, dependsOn: ["host"], needsAuth: true, note: "릴스는 캐러셀에 넣을 수 없다." });
    add({
      id: "status",
      title: "컨테이너 상태 확인",
      kind: "request",
      method: "GET",
      url: `${base}/<CONTAINER_ID:reel>`,
      params: { fields: "status_code", poll_every_sec: INSTAGRAM.limits.statusPollIntervalSec, poll_max_sec: INSTAGRAM.limits.statusPollMaxSec },
      dependsOn: ["reel"],
      needsAuth: true,
      note: "영상 업로드는 비동기라 컨테이너 ID 를 받아도 성공이 아니다 — FINISHED 를 확인한 뒤 게시한다.",
    });
    add({ id: "publish", title: "게시", kind: "request", method: "POST", url: `${base}/<IG_USER_ID>/media_publish`, params: { creation_id: "<ID:reel>" }, dependsOn: ["status"], needsAuth: true, note: "사람의 승인(G3) 뒤에만 호출한다." });
    const summary = `릴스 ${input.video.durationSec}초 · 캡션 ${[...caption].length}자(해시태그 포함) · 컨테이너 1개 · 게시 1건`;
    return finish(pieceId, "ig_reel", steps, quotaFor(1), issues, summary);
  }

  return {
    plan(request) {
      return request.kind === "post" ? planPost(request) : planReel(request);
    },
  };
}
