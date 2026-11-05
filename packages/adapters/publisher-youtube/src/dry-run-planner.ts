// YouTube Data API 업로드 계획(dry-run 전용) — videos.insert 재개 가능 업로드를 「세션 시작 → 파일 올리기 → 응답 확인 → 사람이 공개」 순서의 요청 목록으로 만든다.
// 네트워크 호출도 OAuth 토큰·클라이언트 정보 칸도 없다. 근거: docs/05-automation.md §5.8 (2026-11-05 공식 문서 실측).
import type { YoutubePlanRequest, YoutubePublishPlanner } from "@yunseo/application";
import { YOUTUBE, checkYoutubeUpload, isBlocked, type BannedExpressionRule, type PlanParamValue, type PlannedStep, type PublishPlan, type QuotaForecast } from "@yunseo/domain";

export interface YoutubePlannerOptions {
  /** 금지 표현 규칙(프리셋). 조립부가 읽어 넘긴다 */
  bannedExpressions?: readonly BannedExpressionRule[];
}

const UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos";
const SCOPE = "https://www.googleapis.com/auth/youtube.upload";

const mimeOf = (container: string) => (container === "mov" ? "video/quicktime" : "video/mp4");

export function createYoutubeDryRunPlanner(options: YoutubePlannerOptions = {}): YoutubePublishPlanner {
  const rules = options.bannedExpressions ?? [];

  return {
    plan(request: YoutubePlanRequest): PublishPlan {
      const { input, pieceId, now } = request;
      const issues = checkYoutubeUpload({ ...input, now }, rules);
      const steps: PlannedStep[] = [];
      const add = (step: Omit<PlannedStep, "order" | "dependsOn" | "needsAuth" | "params" | "url" | "method"> & Partial<Pick<PlannedStep, "dependsOn" | "needsAuth" | "params" | "url" | "method">>) => {
        steps.push({ order: steps.length + 1, dependsOn: [], needsAuth: false, params: {}, url: null, method: null, ...step });
      };

      add({
        id: "consent",
        title: "OAuth 동의 범위 확인",
        kind: "local",
        params: { scope: SCOPE },
        note: "채널 소유자가 본인 계정으로 동의한다. 이 시스템은 토큰을 받지도 저장하지도 않는다 — 실제 연결은 별도 설계·승인 뒤 단계다.",
      });

      const session: Record<string, PlanParamValue> = {
        part: "snippet,status",
        uploadType: "resumable",
        "snippet.title": input.title,
        "snippet.description": input.description,
        "snippet.tags": [...input.tags],
        "snippet.categoryId": "<CATEGORY_ID: 사람이 정함>",
        "status.privacyStatus": input.privacyStatus,
      };
      if (input.publishAt !== null) session["status.publishAt"] = input.publishAt;
      if (input.selfDeclaredMadeForKids !== null) session["status.selfDeclaredMadeForKids"] = input.selfDeclaredMadeForKids;
      if (input.containsSyntheticMedia !== null) session["status.containsSyntheticMedia"] = input.containsSyntheticMedia;
      session["header:X-Upload-Content-Length"] = input.video.bytes;
      session["header:X-Upload-Content-Type"] = mimeOf(input.video.container);
      add({
        id: "session",
        title: "재개 가능한 업로드 세션 시작",
        kind: "request",
        method: "POST",
        url: `${UPLOAD_URL}?uploadType=resumable&part=snippet,status`,
        params: session,
        dependsOn: ["consent"],
        needsAuth: true,
        note: "응답 Location 헤더가 세션 주소다. categoryId 필수 여부는 구현 때 문서로 다시 확인한다.",
      });
      add({
        id: "upload",
        title: "영상 파일 올리기",
        kind: "request",
        method: "PUT",
        url: "<SESSION_URI>",
        params: { "header:Content-Type": mimeOf(input.video.container), body: `<파일 바이트: ${input.video.name}>` },
        dependsOn: ["session"],
        needsAuth: true,
        note: "네트워크가 끊기면 같은 세션 주소로 이어 올린다(재개).",
      });
      add({ id: "confirm", title: "응답 확인", kind: "local", dependsOn: ["upload"], note: "성공 응답의 영상 ID 를 기록한다. 실패·중단은 재시도 횟수를 정해 두고 사람에게 알린다." });
      add({
        id: "human-publish",
        title: input.publishAt !== null ? "예약 공개 확인 (사람)" : "공개 전환 (사람)",
        kind: "local",
        dependsOn: ["confirm"],
        params: { privacyStatus: input.privacyStatus },
        note:
          input.publishAt !== null
            ? "publishAt 은 비공개(private) 상태의 영상에만 걸리고, 시각이 되면 공개된다. 공개 전 사람이 YouTube Studio 에서 한 번 더 확인한다."
            : "비공개로 올린 영상을 사람이 YouTube Studio 에서 확인한 뒤 공개로 바꾼다 — 마지막 공개 버튼은 사람이 누른다.",
      });

      const quota: QuotaForecast[] = [
        {
          label: "videos.insert",
          used: YOUTUBE.quota.insertCostUnits,
          limit: YOUTUBE.quota.insertPerDay,
          unit: "회",
          window: `하루 (${YOUTUBE.quota.resetsAt} 초기화)`,
          basis: "할당량 계산 문서 — 「videos.insert: 100 quota per day. Each call costs 1 quota.」 (예전 가정 1,600단위가 아님)",
        },
        {
          label: "그 밖 메서드 합계",
          used: 0,
          limit: YOUTUBE.quota.otherUnitsPerDay,
          unit: "단위",
          window: `하루 (${YOUTUBE.quota.resetsAt} 초기화)`,
          basis: `이 계획은 다른 메서드를 부르지 않는다. 참고: videos.update ${YOUTUBE.quota.videosUpdateCostUnits}단위, thumbnails.set ${YOUTUBE.quota.thumbnailsSetCostUnits}단위`,
        },
      ];

      const descBytes = new TextEncoder().encode(input.description).length;
      const summary = `영상 ${input.video.durationSec}초 · 제목 ${[...input.title].length}자 · 설명 ${descBytes}바이트 · ${input.privacyStatus === "private" ? "비공개로 업로드" : `${input.privacyStatus} 로 업로드`}${input.publishAt !== null ? ` · 예약 ${input.publishAt}` : ""}`;
      return { mode: "dry-run", platform: "youtube", kind: "yt_short", pieceId, steps, quota, issues, blocked: isBlocked(issues), summary };
    },
  };
}
