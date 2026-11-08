// [W5 릴스] 내보낸 결과 받기 — POST /api/reels/:id/export 가 만든 mp4·srt 를 판(revision)별로 내려준다. ?dl=1 이면 내려받기.
// 경로는 서버(server/reels-ops.ts exportedReelFile)가 정한다 — 요청값은 id·판 번호·종류만 쓰고 모양이 틀리거나 파일이 없으면 404.
import { notFound, route } from "@/server/api";
import { fileResponse } from "@/server/library";
import { exportedReelFile } from "@/server/reels-ops";

export const dynamic = "force-dynamic";

export const GET = route(async (req: Request, ctx: { params: Promise<{ pieceId: string; revision: string; kind: string }> }) => {
  const { pieceId: id, revision, kind } = await ctx.params;
  if (kind !== "video" && kind !== "srt") throw notFound("FILE_NOT_FOUND", "파일이 없다");
  const ext = kind === "video" ? "mp4" : "srt";
  const dl = new URL(req.url).searchParams.has("dl");
  return fileResponse(req, exportedReelFile(id, revision, kind), dl ? { download: `${id}-r${revision}.${ext}` } : {});
});
