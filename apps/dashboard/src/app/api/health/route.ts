// 헬스 체크. 상태 확인만 하고 외부 API·DB 를 부르지 않는다.
export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json({ status: "ok", app: "dashboard" });
}
