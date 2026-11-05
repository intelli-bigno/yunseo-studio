// 플랫폼 게시 규격 — 공식 문서로 실측한 값(2026-11-05). 값이 바뀌면 이 파일과 evidence.ts 만 고친다.
// 근거(문서 URL·확인일·원문 인용)는 evidence.ts, 읽는 법과 요약은 docs/05-automation.md §5.8.
// 용량 단위는 보수적으로 십진수(1MB = 1,000,000바이트)로 잡는다 — 문서가 MB 의 정의를 적지 않았다.

/** 문서의 「latest version」 표기 */
export const GRAPH_API_VERSION = "v27.0";

export const INSTAGRAM = {
  image: {
    format: "jpeg",
    maxBytes: 8_000_000,
    /** 가로/세로 — 4:5 ~ 1.91:1 */
    minAspect: 4 / 5,
    maxAspect: 1.91,
    minWidth: 320,
    maxWidth: 1440,
  },
  carousel: {
    /** 문서: 「Carousels are limited to 20 images, videos, or a mix of the two.」 (예전 가정 10개 → 20개) */
    maxItems: 20,
    /** 문서에 적혀 있지 않다 — 1장은 캐러셀이 아니라 단일 이미지 게시로 계획한다 [미검증] */
    minItems: 2,
  },
  caption: { maxChars: 2200, maxHashtags: 30, maxMentions: 20 },
  altTextMaxChars: 1000,
  reel: {
    containers: ["mp4", "mov"],
    videoCodecs: ["h264", "hevc"],
    maxBytes: 300_000_000,
    minDurationSec: 3,
    maxDurationSec: 900,
    minFps: 23,
    maxFps: 60,
    maxWidth: 1920,
    /** 문서 권장 비율(9:16) — 다르면 잘리거나 빈 공간이 생긴다 */
    recommendedAspect: 9 / 16,
    /** 허용 범위: 0.01:1 ~ 10:1 */
    minAspect: 0.01,
    maxAspect: 10,
  },
  limits: {
    /** 가이드 「Rate Limit」: 24시간 이동 구간 API 게시 100건, 캐러셀은 1건으로 센다 */
    postsPer24hGuide: 100,
    /** 같은 문서의 캐러셀 항목과 content_publishing_limit 참조 문서는 50건 — 문서끼리 어긋나 낮은 값을 상한으로 쓴다 */
    postsPer24hConservative: 50,
    containersPer24h: 400,
    containerTtlHours: 24,
    /** 컨테이너 상태는 1분에 1회, 최대 5분 이내로 조회하길 권장 */
    statusPollIntervalSec: 60,
    statusPollMaxSec: 300,
  },
} as const;

export const YOUTUBE = {
  title: { maxChars: 100, forbidden: ["<", ">"] },
  description: { maxBytes: 5000 },
  tags: { maxChars: 500 },
  fileMaxBytes: 256 * 1024 ** 3,
  shorts: {
    /** 2024-10-15 이후 업로드: 정사각형 또는 세로, 3분 이하면 Shorts 로 분류 */
    maxDurationSec: 180,
  },
  quota: {
    /** videos.insert 는 자기 버킷(Video Uploads)에서 호출당 1단위, 기본 하루 100회 */
    insertCostUnits: 1,
    insertPerDay: 100,
    /** 그 밖의 모든 메서드를 합친 기본 일일 한도 */
    otherUnitsPerDay: 10_000,
    videosUpdateCostUnits: 50,
    thumbnailsSetCostUnits: 50,
    /** 일일 할당량은 태평양시 자정에 초기화 */
    resetsAt: "00:00 PT",
  },
  privacy: ["private", "public", "unlisted"],
} as const;

export type YoutubePrivacy = (typeof YOUTUBE.privacy)[number];
