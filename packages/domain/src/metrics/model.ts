// 성과 지표 모델 — 한 게시물의 한 시점 값(MetricSnapshot, docs/04). 값은 그 시점의 누적(lifetime)이다.
// 지표 이름은 공식 문서의 지표 이름을 따른다: Instagram 미디어 인사이트(views·reach·saved·shares·profile_visits·follows …),
// YouTube Analytics(views·estimatedMinutesWatched·averageViewDuration·subscribersGained …). 근거는 docs/05 §5.8.

export const METRIC_PLATFORMS = ["instagram", "youtube"] as const;
export type MetricPlatform = (typeof METRIC_PLATFORMS)[number];

export type MetricUnit = "count" | "seconds" | "minutes" | "percent";

export interface MetricDef {
  label: string;
  unit: MetricUnit;
  platforms: readonly MetricPlatform[];
  /** 편들의 합계에 더해도 뜻이 있는가(도달·평균 값은 더하면 안 된다) */
  additive: boolean;
}

export const METRIC_DEFS = {
  views: { label: "조회", unit: "count", platforms: ["instagram", "youtube"], additive: true },
  impressions: { label: "노출", unit: "count", platforms: ["instagram", "youtube"], additive: true },
  reach: { label: "도달", unit: "count", platforms: ["instagram"], additive: false },
  likes: { label: "좋아요", unit: "count", platforms: ["instagram", "youtube"], additive: true },
  comments: { label: "댓글", unit: "count", platforms: ["instagram", "youtube"], additive: true },
  saved: { label: "저장", unit: "count", platforms: ["instagram"], additive: true },
  shares: { label: "공유", unit: "count", platforms: ["instagram", "youtube"], additive: true },
  profile_visits: { label: "프로필 방문", unit: "count", platforms: ["instagram"], additive: true },
  follows: { label: "팔로우", unit: "count", platforms: ["instagram"], additive: true },
  total_interactions: { label: "총 상호작용", unit: "count", platforms: ["instagram"], additive: true },
  reels_avg_watch_sec: { label: "릴스 평균 시청(초)", unit: "seconds", platforms: ["instagram"], additive: false },
  engaged_views: { label: "참여 조회", unit: "count", platforms: ["youtube"], additive: true },
  watch_minutes: { label: "시청 시간(분)", unit: "minutes", platforms: ["youtube"], additive: true },
  avg_view_sec: { label: "평균 시청(초)", unit: "seconds", platforms: ["youtube"], additive: false },
  avg_view_percent: { label: "평균 시청 비율(%)", unit: "percent", platforms: ["youtube"], additive: false },
  impressions_ctr_percent: { label: "노출 클릭률(%)", unit: "percent", platforms: ["youtube"], additive: false },
  subscribers_gained: { label: "구독 증가", unit: "count", platforms: ["youtube"], additive: true },
  subscribers_lost: { label: "구독 감소", unit: "count", platforms: ["youtube"], additive: true },
} as const satisfies Record<string, MetricDef>;

export type MetricKey = keyof typeof METRIC_DEFS;
export const METRIC_KEYS = Object.keys(METRIC_DEFS) as MetricKey[];

export const metricKeysFor = (platform: MetricPlatform): MetricKey[] => METRIC_KEYS.filter((k) => (METRIC_DEFS[k].platforms as readonly MetricPlatform[]).includes(platform));

/** 입력 폼에 먼저 보여 주는 핵심 지표(나머지는 CSV 로 들어온다) */
export const CORE_METRIC_KEYS: Record<MetricPlatform, readonly MetricKey[]> = {
  instagram: ["views", "reach", "likes", "comments", "saved", "shares", "profile_visits", "follows"],
  youtube: ["views", "watch_minutes", "avg_view_sec", "avg_view_percent", "likes", "comments", "shares", "subscribers_gained"],
};

export type MetricValues = Partial<Record<MetricKey, number>>;
export type MetricSource = "manual" | "csv";

export interface NewMetricSnapshot {
  pieceId: string;
  platform: MetricPlatform;
  /** 측정 기준일 YYYY-MM-DD */
  capturedAt: string;
  source: MetricSource;
  values: MetricValues;
  note: string;
}

export interface MetricSnapshot extends NewMetricSnapshot {
  id: string;
}
