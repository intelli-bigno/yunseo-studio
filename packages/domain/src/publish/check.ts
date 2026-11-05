// 게시 규격 검사 — 순수 함수. 플랫폼 문서 값(specs.ts)에 맞는지 보고 「차단/경고」 목록을 돌려준다.
// 투자 권유·금지 표현 검사는 compliance 규칙을 그대로 쓴다(규칙 데이터는 presets, 로딩은 조립부).
import { findBannedExpressions, type BannedExpressionRule } from "../compliance";
import { INSTAGRAM, YOUTUBE } from "./specs";
import type { ImageFacts, InstagramPostInput, InstagramReelInput, SpecIssue, VideoFacts, YoutubeUploadInput } from "./plan";

const mb = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)}MB`;
const chars = (s: string) => [...s].length;
const bytesOf = (s: string) => new TextEncoder().encode(s).length;
const EPS = 1e-6;

/** 해시태그 문자열을 #붙인 형태로 통일 */
export const hashtagText = (tag: string): string => `#${tag.trim().replace(/^#+/, "")}`;

/** 캡션 + 해시태그 — 플랫폼에 실제로 들어가는 글 */
export function composeInstagramCaption(caption: string, hashtags: readonly string[]): string {
  const tags = hashtags.map(hashtagText).filter((t) => t.length > 1);
  return tags.length ? `${caption.trimEnd()}\n\n${tags.join(" ")}` : caption;
}

const countHashtags = (text: string) => (text.match(/#[\p{L}\p{N}_]+/gu) ?? []).length;
const countMentions = (text: string) => (text.match(/(?:^|[^\p{L}\p{N}_.])@[A-Za-z0-9._]+/gu) ?? []).length;

function bannedIssues(text: string, subject: string, rules: readonly BannedExpressionRule[]): SpecIssue[] {
  return findBannedExpressions(text, "body", rules).map((h) => ({
    code: "banned_expression",
    severity: h.severity,
    subject,
    message: `금지 표현 「${h.term}」 (${h.ruleId}${h.severity === "warn" ? " · 사람 판정" : ""})`,
    fix: "문구를 고쳐 다시 렌더한다",
  }));
}

function placeholderIssues(text: string, subject: string): SpecIssue[] {
  return /\bTBD\b/.test(text) ? [{ code: "placeholder_left", severity: "block", subject, message: "자리표시자 TBD 가 남아 있다", fix: "프리셋·원고의 미정 값을 채운다" }] : [];
}

function imageIssues(img: ImageFacts, subject: string): SpecIssue[] {
  const out: SpecIssue[] = [];
  const spec = INSTAGRAM.image;
  if (img.format !== "jpeg") {
    out.push({ code: "jpeg_conversion_required", severity: "warn", subject, message: `${img.format.toUpperCase()} 는 허용되지 않는다 — JPEG 만 허용`, fix: "게시 직전 JPEG(sRGB)로 변환하고 변환본 용량을 다시 확인한다" });
  }
  if (img.bytes > spec.maxBytes) {
    out.push({
      code: "image_too_large",
      severity: img.format === "jpeg" ? "block" : "warn",
      subject,
      message: `${mb(img.bytes)} — ${mb(spec.maxBytes)} 이하여야 한다${img.format === "jpeg" ? "" : " (JPEG 변환 뒤 다시 확인)"}`,
      fix: "해상도 또는 품질을 낮춘다",
    });
  }
  const ratio = img.width / img.height;
  if (ratio < spec.minAspect - EPS || ratio > spec.maxAspect + EPS) {
    out.push({ code: "image_aspect_out_of_range", severity: "block", subject, message: `${img.width}x${img.height} (${ratio.toFixed(3)}) — 가로세로비는 4:5 ~ 1.91:1 이어야 한다`, fix: "4:5(1080x1350) 이상 가로로 맞춰 다시 렌더한다" });
  }
  if (img.width < spec.minWidth || img.width > spec.maxWidth) {
    out.push({ code: "image_width_scaled", severity: "warn", subject, message: `폭 ${img.width}px — ${spec.minWidth}~${spec.maxWidth}px 밖이라 자동 확대·축소된다` });
  }
  return out;
}

function captionIssues(caption: string, hashtags: readonly string[], rules: readonly BannedExpressionRule[]): SpecIssue[] {
  const text = composeInstagramCaption(caption, hashtags);
  const spec = INSTAGRAM.caption;
  const out: SpecIssue[] = [];
  const n = chars(text);
  if (n === 0) out.push({ code: "caption_empty", severity: "warn", subject: "캡션", message: "캡션이 비어 있다" });
  if (n > spec.maxChars) out.push({ code: "caption_too_long", severity: "block", subject: "캡션", message: `${n}자 — ${spec.maxChars}자 이하여야 한다(해시태그 포함)`, fix: "캡션을 줄인다" });
  const tags = countHashtags(text);
  if (tags > spec.maxHashtags) out.push({ code: "hashtags_too_many", severity: "block", subject: "해시태그", message: `${tags}개 — ${spec.maxHashtags}개 이하여야 한다` });
  const mentions = countMentions(text);
  if (mentions > spec.maxMentions) out.push({ code: "mentions_too_many", severity: "block", subject: "@ 태그", message: `${mentions}개 — ${spec.maxMentions}개 이하여야 한다` });
  return [...out, ...placeholderIssues(text, "캡션"), ...bannedIssues(text, "캡션", rules)];
}

const aiDisclosure = (value: boolean | null): SpecIssue[] =>
  value === null ? [{ code: "ai_disclosure_undecided", severity: "warn", subject: "AI 콘텐츠 표시", message: "AI 생성 이미지 자기 공개(is_ai_generated)를 정하지 않았다", fix: "사람이 사용 여부를 정한다" }] : [];

export function checkInstagramPost(input: InstagramPostInput, rules: readonly BannedExpressionRule[] = []): SpecIssue[] {
  const out: SpecIssue[] = [];
  const spec = INSTAGRAM.carousel;
  const count = input.images.length;
  if (count === 0) out.push({ code: "no_images", severity: "block", subject: "카드", message: "게시할 이미지가 없다" });
  if (count > spec.maxItems) out.push({ code: "carousel_too_many", severity: "block", subject: "카드", message: `${count}장 — 캐러셀은 ${spec.maxItems}장까지`, fix: "장수를 줄인다" });
  input.images.forEach((img, i) => out.push(...imageIssues(img, `카드 ${i + 1} (${img.name})`)));

  const first = input.images[0];
  if (first && count > 1) {
    const base = first.width / first.height;
    const odd = input.images.filter((img) => Math.abs(img.width / img.height - base) > 0.005);
    if (odd.length > 0) out.push({ code: "carousel_aspect_mixed", severity: "warn", subject: "카드", message: `${odd.length}장의 비율이 첫 장과 달라 첫 장 비율로 잘린다`, fix: "모든 카드를 같은 비율로 렌더한다" });
  }

  input.images.forEach((_, i) => {
    const alt = input.altTexts[i] ?? "";
    if (alt === "") out.push({ code: "alt_text_missing", severity: "warn", subject: `카드 ${i + 1}`, message: "대체 텍스트가 없다", fix: "접근성을 위해 대체 텍스트를 쓴다" });
    else if (chars(alt) > INSTAGRAM.altTextMaxChars) out.push({ code: "alt_text_too_long", severity: "block", subject: `카드 ${i + 1}`, message: `대체 텍스트 ${chars(alt)}자 — ${INSTAGRAM.altTextMaxChars}자 이하여야 한다` });
  });
  if (input.altTexts.length > count) out.push({ code: "alt_text_extra", severity: "warn", subject: "대체 텍스트", message: `카드 ${count}장보다 대체 텍스트가 ${input.altTexts.length}개로 많다` });

  return [...out, ...captionIssues(input.caption, input.hashtags, rules), ...aiDisclosure(input.aiGenerated)];
}

function videoIssues(video: VideoFacts, subject: string): SpecIssue[] {
  const spec = INSTAGRAM.reel;
  const out: SpecIssue[] = [];
  if (!(spec.containers as readonly string[]).includes(video.container)) out.push({ code: "video_container", severity: "block", subject, message: `컨테이너 ${video.container} — MP4 또는 MOV 여야 한다` });
  if (video.durationSec < spec.minDurationSec || video.durationSec > spec.maxDurationSec) {
    out.push({ code: "reel_duration", severity: "block", subject, message: `${video.durationSec}초 — ${spec.minDurationSec}초 ~ ${spec.maxDurationSec / 60}분이어야 한다` });
  }
  if (video.bytes > spec.maxBytes) out.push({ code: "video_too_large", severity: "block", subject, message: `${mb(video.bytes)} — ${mb(spec.maxBytes)} 이하여야 한다`, fix: "비트레이트를 낮춘다" });
  if (video.width > spec.maxWidth) out.push({ code: "video_width", severity: "block", subject, message: `폭 ${video.width}px — ${spec.maxWidth}px 이하여야 한다` });
  const ratio = video.width / video.height;
  if (ratio < spec.minAspect || ratio > spec.maxAspect) out.push({ code: "video_aspect_out_of_range", severity: "block", subject, message: `비율 ${ratio.toFixed(3)} — 허용 범위를 벗어난다` });
  else if (Math.abs(ratio - spec.recommendedAspect) > 0.01) out.push({ code: "video_aspect_not_9_16", severity: "warn", subject, message: `비율 ${ratio.toFixed(3)} — 9:16 이 아니면 잘리거나 빈 공간이 생긴다` });
  if (video.fps !== null && (video.fps < spec.minFps || video.fps > spec.maxFps)) out.push({ code: "video_fps", severity: "block", subject, message: `${video.fps}fps — ${spec.minFps}~${spec.maxFps}fps 여야 한다` });
  if (video.videoCodec !== null && !(spec.videoCodecs as readonly string[]).includes(video.videoCodec)) out.push({ code: "video_codec", severity: "block", subject, message: `코덱 ${video.videoCodec} — H.264 또는 HEVC 여야 한다` });
  if (video.videoCodec === null || video.fps === null) out.push({ code: "video_probe_missing", severity: "warn", subject, message: "코덱·프레임율은 렌더 결과에 없어 검사하지 못했다", fix: "게시 전 영상 파일을 실측한다(ffprobe)" });
  return out;
}

export function checkInstagramReel(input: InstagramReelInput, rules: readonly BannedExpressionRule[] = []): SpecIssue[] {
  const out = videoIssues(input.video, `영상 (${input.video.name})`);
  if (input.cover) {
    const c = input.cover;
    if (c.format !== "jpeg") out.push({ code: "jpeg_conversion_required", severity: "warn", subject: `커버 (${c.name})`, message: `${c.format.toUpperCase()} 는 허용되지 않는다 — 커버도 JPEG`, fix: "JPEG 로 변환한다" });
    if (c.bytes > INSTAGRAM.image.maxBytes) out.push({ code: "image_too_large", severity: "warn", subject: `커버 (${c.name})`, message: `${mb(c.bytes)} — 8MB 이하여야 한다` });
  }
  return [...out, ...captionIssues(input.caption, input.hashtags, rules), ...aiDisclosure(input.aiGenerated)];
}

/** 태그 글자 수 — 쉼표로 이어 붙이고, 공백이 든 태그는 따옴표 2자를 더한다(문서 계산 규칙) */
export function youtubeTagsLength(tags: readonly string[]): number {
  const items = tags.map((t) => (/\s/.test(t) ? chars(t) + 2 : chars(t)));
  return items.reduce((a, b) => a + b, 0) + Math.max(0, items.length - 1);
}

export function checkYoutubeUpload(input: YoutubeUploadInput & { now: string }, rules: readonly BannedExpressionRule[] = []): SpecIssue[] {
  const out: SpecIssue[] = [];
  const v = input.video;
  const title = input.title.trim();
  if (title === "") out.push({ code: "yt_title_empty", severity: "block", subject: "제목", message: "제목이 비어 있다" });
  if (chars(title) > YOUTUBE.title.maxChars) out.push({ code: "yt_title_too_long", severity: "block", subject: "제목", message: `${chars(title)}자 — ${YOUTUBE.title.maxChars}자 이하여야 한다` });
  if (YOUTUBE.title.forbidden.some((c) => title.includes(c)) || /[<>]/.test(input.description)) out.push({ code: "yt_forbidden_char", severity: "block", subject: "제목·설명", message: "< 또는 > 는 쓸 수 없다" });
  const descBytes = bytesOf(input.description);
  if (descBytes > YOUTUBE.description.maxBytes) out.push({ code: "yt_description_too_long", severity: "block", subject: "설명", message: `${descBytes}바이트 — ${YOUTUBE.description.maxBytes}바이트 이하여야 한다(한글은 글자당 3바이트)`, fix: "설명을 줄인다" });
  const tagLen = youtubeTagsLength(input.tags);
  if (tagLen > YOUTUBE.tags.maxChars) out.push({ code: "yt_tags_too_long", severity: "block", subject: "태그", message: `${tagLen}자 — ${YOUTUBE.tags.maxChars}자 이하여야 한다(쉼표·따옴표 포함)` });

  if (v.durationSec > YOUTUBE.shorts.maxDurationSec) out.push({ code: "yt_not_short_duration", severity: "block", subject: "영상", message: `${v.durationSec}초 — Shorts 는 ${YOUTUBE.shorts.maxDurationSec}초(3분) 이하`, fix: "영상을 줄인다" });
  if (v.height < v.width) out.push({ code: "yt_not_short_aspect", severity: "block", subject: "영상", message: `${v.width}x${v.height} — Shorts 는 정사각형 또는 세로 비율`, fix: "세로(9:16)로 렌더한다" });
  if (v.bytes > YOUTUBE.fileMaxBytes) out.push({ code: "yt_file_too_large", severity: "block", subject: "영상", message: "256GB 를 넘는다" });

  if (input.publishAt !== null) {
    if (input.privacyStatus !== "private") out.push({ code: "yt_publish_at_needs_private", severity: "block", subject: "예약 공개", message: "publishAt 은 비공개(private) 상태에서만 설정할 수 있다", fix: "privacyStatus 를 private 로 둔다" });
    if (Number.isNaN(Date.parse(input.publishAt))) out.push({ code: "yt_publish_at_invalid", severity: "block", subject: "예약 공개", message: "publishAt 이 ISO 8601 시각이 아니다" });
    else if (Date.parse(input.publishAt) <= Date.parse(input.now)) out.push({ code: "yt_publish_at_past", severity: "warn", subject: "예약 공개", message: "과거 시각이면 올리자마자 공개된다", fix: "미래 시각으로 정한다" });
  }
  if (input.privacyStatus === "public") out.push({ code: "yt_public_without_gate", severity: "warn", subject: "공개 범위", message: "공개로 올리면 사람의 마지막 확인 없이 노출된다 — 비공개 업로드 후 Studio 에서 공개하는 것이 계획의 기본", fix: "private 로 올린다" });
  if (input.selfDeclaredMadeForKids === null) out.push({ code: "yt_kids_undecided", severity: "warn", subject: "아동용 여부", message: "selfDeclaredMadeForKids 를 정하지 않았다", fix: "채널 소유자가 정한다" });
  if (input.containsSyntheticMedia === null) out.push({ code: "yt_synthetic_undecided", severity: "warn", subject: "합성 콘텐츠 공개", message: "containsSyntheticMedia(실제처럼 보이는 합성 콘텐츠) 여부를 정하지 않았다", fix: "채널 소유자가 정한다" });

  const text = `${input.title}\n${input.description}\n${input.tags.join(" ")}`;
  return [...out, ...placeholderIssues(text, "제목·설명"), ...bannedIssues(text, "제목·설명", rules)];
}
