// [W5 릴스] 내보내기 — 프로젝트 지금 판을 타임라인 합성기(ffmpeg)로 1080x1920 MP4 + SRT 로 만든다. ops 밖(docs/11 §3 내보내기).
// 실패는 종류별 코드로 나간다: ffmpeg 없음 FFMPEG_UNAVAILABLE(503) · 시간 초과 FFMPEG_TIMEOUT(504) · 합성 실패 FFMPEG_FAILED(500) · 원본 없음 SOURCE_NOT_FOUND(422) · 그 밖 RENDER_FAILED(500).
import { notFound, route } from "@/server/api";
import { renderFailure } from "@/server/failures";
import { isReelsProjectId } from "@/server/reels";
import { exportReelsProject } from "@/server/reels-ops";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ pieceId: string }> };

export const POST = route(async (_req: Request, ctx: Ctx) => {
  const id = (await ctx.params).pieceId;
  const missing = () => notFound("PROJECT_NOT_FOUND", `${id} 없음`);
  if (!isReelsProjectId(id)) throw missing();
  const r = await exportReelsProject(id).catch((e: unknown) => {
    throw renderFailure(e);
  });
  if (!r) throw missing();
  return Response.json(r);
});
