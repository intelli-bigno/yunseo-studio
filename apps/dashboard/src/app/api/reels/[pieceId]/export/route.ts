// [W5 릴스] 내보내기 — 프로젝트 지금 판을 타임라인 합성기(ffmpeg)로 1080x1920 MP4 + SRT 로 만든다. ops 밖(docs/11 §3 내보내기).
import { isReelsProjectId } from "@/server/reels";
import { exportReelsProject } from "@/server/reels-ops";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ pieceId: string }> };

export async function POST(_req: Request, ctx: Ctx): Promise<Response> {
  const id = (await ctx.params).pieceId;
  if (!isReelsProjectId(id)) return Response.json({ error: { code: "PROJECT_NOT_FOUND", message: `${id} 없음` } }, { status: 404 });
  try {
    const r = await exportReelsProject(id);
    return r ? Response.json(r) : Response.json({ error: { code: "PROJECT_NOT_FOUND", message: `${id} 없음` } }, { status: 404 });
  } catch (e) {
    return Response.json({ error: { code: "RENDER_FAILED", message: e instanceof Error ? e.message : String(e) } }, { status: 500 });
  }
}
