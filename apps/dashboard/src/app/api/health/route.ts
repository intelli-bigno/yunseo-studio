// 헬스 체크. 상태 확인만 하고 외부 API·DB 를 부르지 않는다.
// [L9] 배포 커밋(YUNSEO_REVISION — 감독기가 서비스 정의로 넣는다)과 프로세스 시작 시각을 싣는다 — /status 의 「배포 커밋」 칸이 읽는다
export const dynamic = "force-dynamic";

const startedAt = new Date().toISOString();

export function GET(): Response {
  return Response.json({ status: "ok", app: "dashboard", startedAt, revision: process.env.YUNSEO_REVISION?.trim() || null });
}
