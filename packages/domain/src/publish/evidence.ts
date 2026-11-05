// 게시 규격의 근거 — 공식 문서 URL·확인일·원문 인용(영어 원문 그대로). 2026-11-05 Aside 로 공개 문서만 열람했다(로그인·앱 생성 없음).
// docs/05 의 [미검증] 이던 항목이 여기서 「확인됨」「바뀜」「문서끼리 충돌」 중 하나가 됐다.

export type EvidenceVerdict = "confirmed" | "changed" | "conflict" | "unverified";

export interface SpecEvidence {
  id: string;
  platform: "instagram" | "youtube";
  /** docs/05 에 있던 가정 */
  assumption: string;
  verdict: EvidenceVerdict;
  /** 실측 결과 한 줄 */
  finding: string;
  url: string;
  /** 문서 하단 「Updated/Last updated」 */
  docUpdated: string;
  checkedAt: string;
  /** 원문 그대로 */
  quote: string;
}

const CHECKED = "2026-11-05";
const IG_GUIDE = "https://developers.facebook.com/documentation/instagram-platform/content-publishing";
const IG_MEDIA = "https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/media";
const IG_LIMIT = "https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/content_publishing_limit";
const YT_INSERT = "https://developers.google.com/youtube/data/reference/rest/v3/videos/insert";
const YT_RESOURCE = "https://developers.google.com/youtube/data/reference/rest/v3/videos";
const YT_QUOTA = "https://developers.google.com/youtube/data/determine_quota_cost";
const YT_AUDIT = "https://developers.google.com/youtube/data/guides/quota_and_compliance_audits";
const YT_SHORTS = "https://support.google.com/youtube/answer/15424877";

export const SPEC_EVIDENCE: readonly SpecEvidence[] = [
  {
    id: "ig-carousel-max",
    platform: "instagram",
    assumption: "캐러셀 항목 상한 10개",
    verdict: "changed",
    finding: "최대 20개(이미지·영상 합산). 우리 카드(표지+5단+출처 = 7장)는 한도 안.",
    url: IG_GUIDE,
    docUpdated: "2026-10-20",
    checkedAt: CHECKED,
    quote: "Carousels are limited to 20 images, videos, or a mix of the two.",
  },
  {
    id: "ig-publish-24h",
    platform: "instagram",
    assumption: "계정당 24시간 API 게시 상한",
    verdict: "conflict",
    finding: "문서끼리 다르다: 가이드 Rate Limit 은 100건, 같은 가이드의 캐러셀 항목·content_publishing_limit 참조는 50건. 코드는 낮은 50건을 상한으로 쓰고, 실제 값은 content_publishing_limit 조회로 확인한다. 캐러셀은 1건으로 센다.",
    url: IG_GUIDE,
    docUpdated: "2026-10-20",
    checkedAt: CHECKED,
    quote:
      "Instagram accounts are limited to 100 API-published posts within a 24-hour moving period. Carousels count as a single post. / Accounts are limited to 50 published posts within a 24-hour period. Publishing a carousel counts as a single post.",
  },
  {
    id: "ig-publish-24h-reference",
    platform: "instagram",
    assumption: "계정당 24시간 API 게시 상한",
    verdict: "conflict",
    finding: "content_publishing_limit 참조 문서(2024-07-23 갱신)는 quota_total 이 50.",
    url: IG_LIMIT,
    docUpdated: "2024-07-23",
    checkedAt: CHECKED,
    quote: "quota_total — The maximum number of IG Containers the app user can publish within the quota_duration time period (currently 50).",
  },
  {
    id: "ig-container-limit",
    platform: "instagram",
    assumption: "(가정 없음) 컨테이너 생성 한도",
    verdict: "confirmed",
    finding: "컨테이너는 24시간 뒤 만료, 24시간 이동 구간에 400개까지 생성. 캐러셀 1건 = 항목 컨테이너 N개 + 묶음 컨테이너 1개.",
    url: IG_MEDIA,
    docUpdated: "(미표기)",
    checkedAt: CHECKED,
    quote: "Containers expire after 24 hours / An Instagram account can only create 400 containers within a rolling 24 hour period",
  },
  {
    id: "ig-image-jpeg",
    platform: "instagram",
    assumption: "이미지는 JPEG 만",
    verdict: "confirmed",
    finding: "JPEG 만 허용(MPO·JPS 같은 확장 JPEG 도 불가). 우리 카드는 PNG 라 게시 직전 JPEG(sRGB) 변환이 필요하다.",
    url: IG_GUIDE,
    docUpdated: "2026-10-20",
    checkedAt: CHECKED,
    quote: "JPEG is the only image format supported. Extended JPEG formats such as MPO and JPS are not supported.",
  },
  {
    id: "ig-image-spec",
    platform: "instagram",
    assumption: "(가정 없음) 이미지 용량·비율·폭",
    verdict: "confirmed",
    finding: "8MB 이하, 가로세로비 4:5~1.91:1, 폭 320~1440(범위 밖은 자동 확대·축소), sRGB. 우리 카드 1080x1350 은 정확히 4:5 로 한도 하한.",
    url: IG_MEDIA,
    docUpdated: "(미표기)",
    checkedAt: CHECKED,
    quote:
      "Format: JPEG / File size: 8 MB maximum. / Aspect ratio: Must be within a 4:5 to 1.91:1 range / Minimum width: 320 (will be scaled up to the minimum if necessary) / Maximum width: 1440 (will be scaled down to the maximum if necessary) / Color Space: sRGB.",
  },
  {
    id: "ig-carousel-crop",
    platform: "instagram",
    assumption: "(가정 없음) 캐러셀 비율",
    verdict: "confirmed",
    finding: "모든 장이 첫 장 비율로 잘린다(기본 1:1). 첫 장을 4:5 로 두면 4:5 로 맞춰진다.",
    url: IG_GUIDE,
    docUpdated: "2026-10-20",
    checkedAt: CHECKED,
    quote: "Carousel images are all cropped based on the first image in the carousel, with the default being a 1:1 aspect ratio.",
  },
  {
    id: "ig-caption",
    platform: "instagram",
    assumption: "(가정 없음) 캡션 한도",
    verdict: "confirmed",
    finding: "캡션 2,200자, 해시태그 30개, @ 태그 20개. 이미지 대체 텍스트(alt_text)는 1,000자(단일 이미지·캐러셀 이미지만).",
    url: IG_MEDIA,
    docUpdated: "(미표기)",
    checkedAt: CHECKED,
    quote: "Maximum 2200 characters, 30 hashtags, and 20 @ tags. / For image posts only. Alternative text, up to 1000 character, for an image. Only supported on a single image or image media in a carousel.",
  },
  {
    id: "ig-reel-spec",
    platform: "instagram",
    assumption: "(가정 없음) 릴스 규격",
    verdict: "confirmed",
    finding: "MP4/MOV, H.264/HEVC, 23~60fps, 폭 1920 이하, 3초~15분, 300MB 이하, 9:16 권장. 릴스는 캐러셀에 넣을 수 없다.",
    url: IG_MEDIA,
    docUpdated: "(미표기)",
    checkedAt: CHECKED,
    quote: "Container: MOV or MP4 ... Frame rate: 23-60 FPS. / Duration: 15 mins maximum, 3 seconds minimum / File size: 300MB maximum / Reels cannot appear in carousels",
  },
  {
    id: "ig-public-url",
    platform: "instagram",
    assumption: "이미지는 공개 URL 에서 Meta 가 가져간다",
    verdict: "confirmed",
    finding: "image_url/video_url 은 게시 시도 시점에 공개 접근이 가능해야 한다(파일 업로드 방식은 릴스 재개 가능 업로드뿐).",
    url: IG_GUIDE,
    docUpdated: "2026-10-20",
    checkedAt: CHECKED,
    quote: "We cURL media used in publishing attempts, so the media must be hosted on a publicly accessible server at the time of the attempt.",
  },
  {
    id: "ig-schedule",
    platform: "instagram",
    assumption: "Instagram 은 API 로 예약 시각 지정이 안 된다",
    verdict: "unverified",
    finding: "게시 가이드와 미디어 참조 어디에도 예약 파라미터가 없다(있다는 근거도 없음). 우리 쪽 스케줄러가 그 시각에 media_publish 를 부르는 것으로 계획한다.",
    url: IG_GUIDE,
    docUpdated: "2026-10-20",
    checkedAt: CHECKED,
    quote: "We recommend that your app also enforce the publishing rate limit, especially if your app allows app users to schedule posts to be published in the future.",
  },
  {
    id: "yt-upload-quota",
    platform: "youtube",
    assumption: "업로드 1회 = 1,600단위, 일일 10,000단위 → 하루 약 6회",
    verdict: "changed",
    finding: "videos.insert 는 자기 버킷(Video Uploads)에서 호출당 1단위, 기본 하루 100회. 나머지 메서드는 합쳐 하루 10,000단위. 일일 할당량은 태평양시 자정 초기화.",
    url: YT_QUOTA,
    docUpdated: "2026-11-03",
    checkedAt: CHECKED,
    quote:
      "Projects that enable the YouTube Data API have a default quota allocation of 100 search.list calls, 100 videos.insert calls, and 10,000 units per day combined for all other endpoints. ... Daily quotas reset at midnight Pacific Time (PT).",
  },
  {
    id: "yt-insert-quota-impact",
    platform: "youtube",
    assumption: "업로드 할당량",
    verdict: "changed",
    finding: "videos.insert 참조 문서도 같은 값: 하루 100회, 호출당 1단위. 파일 최대 256GB.",
    url: YT_INSERT,
    docUpdated: "(미표기)",
    checkedAt: CHECKED,
    quote: "Quota impact: 100 calls per day. A call to this method has a quota cost of 1 unit in the Video Uploads quota bucket. / Maximum file size: 256GB",
  },
  {
    id: "yt-private-lock",
    platform: "youtube",
    assumption: "감사 전 API 프로젝트로 올린 영상은 비공개 고정",
    verdict: "changed",
    finding: "현행 문서는 「미검증 API 프로젝트도 비공개로 고정되지 않는다」고 적는다(예전 정책 문구 삭제). 단 크리에이터 계정 설정에 따라 비공개가 기본일 수 있다. 우리는 안전을 위해 비공개 업로드 → 사람이 공개로 계획한다.",
    url: YT_RESOURCE,
    docUpdated: "(미표기)",
    checkedAt: CHECKED,
    quote:
      "In a videos.insert request, if you don't specify a value for this property, the uploaded video's privacy status defaults to public. Certain uploads might default to private based on creator account settings, as explained in the YouTube Help Center. Videos uploaded from unverified API projects are not restricted to private viewing mode.",
  },
  {
    id: "yt-audit",
    platform: "youtube",
    assumption: "공개 전환하려면 감사 신청이 필요하다",
    verdict: "changed",
    finding: "감사는 기본 할당량을 늘릴 때 필요한 절차로 적혀 있고, 업로드 공개 조건으로는 적혀 있지 않다.",
    url: YT_AUDIT,
    docUpdated: "2026-11-03",
    checkedAt: CHECKED,
    quote:
      "If you would like to request additional quota beyond the default allocation, you must first complete an audit to show that your project is in compliance with the YouTube API Services Terms of Service.",
  },
  {
    id: "yt-publish-at",
    platform: "youtube",
    assumption: "status.publishAt 으로 예약 공개",
    verdict: "confirmed",
    finding: "privacyStatus 가 private 일 때만, 한 번도 공개된 적 없는 영상에만 설정 가능. 과거 시각이면 즉시 공개된다.",
    url: YT_RESOURCE,
    docUpdated: "(미표기)",
    checkedAt: CHECKED,
    quote:
      "The date and time when the video is scheduled to publish. It can be set only if the privacy status of the video is private. ... If your request schedules a video to be published at some time in the past, the video will be published right away.",
  },
  {
    id: "yt-shorts-length",
    platform: "youtube",
    assumption: "Shorts 길이 상한 3분",
    verdict: "confirmed",
    finding: "2024-10-15 이후 업로드 영상은 정사각형·세로 비율이고 3분 이하면 Shorts 로 분류. 별도 Shorts 플래그는 없다.",
    url: YT_SHORTS,
    docUpdated: "(미표기)",
    checkedAt: CHECKED,
    quote:
      "Videos uploaded after October 15, 2024: Any videos uploaded on or after this date with a square or vertical aspect ratio up to three minutes in length will be categorized as Shorts on YouTube.",
  },
  {
    id: "yt-metadata-limits",
    platform: "youtube",
    assumption: "(가정 없음) 메타데이터 한도",
    verdict: "confirmed",
    finding: "제목 100자(< > 불가), 설명 5,000바이트(한글은 글자당 3바이트), 태그 합계 500자(쉼표·공백 포함 계산). 아동용 여부(selfDeclaredMadeForKids)·합성 콘텐츠 공개(containsSyntheticMedia)는 업로드 때 채널 소유자가 밝힌다.",
    url: YT_RESOURCE,
    docUpdated: "(미표기)",
    checkedAt: CHECKED,
    quote:
      "The property value has a maximum length of 100 characters and may contain all valid UTF-8 characters except < and >. / maximum length of 5000 bytes / The property value has a maximum length of 500 characters.",
  },
];

export const evidenceFor = (platform: SpecEvidence["platform"]) => SPEC_EVIDENCE.filter((e) => e.platform === platform);
