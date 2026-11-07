// [W5 릴스] 편집 명령 — GET 상태(?since=<revision> 이면 그 뒤 op 로그도) · POST op/batch/undo/redo (docs/12-reels-ops-schema.md)
// 폴더 이름이 [pieceId] 인 것은 같은 단계의 기존 라우트([pieceId]/[renderId]/[kind])와 슬러그 이름을 맞춰야 해서다 — 값은 릴스 프로젝트 id(R-…).
import { isReelsProjectId } from "@/server/reels";
import { reelsOps } from "@/server/reels-ops";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ pieceId: string }> };
const notFound = (id: string) => Response.json({ error: { code: "PROJECT_NOT_FOUND", message: `${id} 없음` } }, { status: 404 });

export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  const id = (await ctx.params).pieceId;
  if (!isReelsProjectId(id)) return notFound(id);
  const since = new URL(req.url).searchParams.get("since");
  const r = reelsOps().getState(id, since !== null && /^\d+$/.test(since) ? Number(since) : undefined);
  return Response.json(r.body, { status: r.status });
}

export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  const id = (await ctx.params).pieceId;
  if (!isReelsProjectId(id)) return notFound(id);
  const text = await req.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  const r = await reelsOps().postOp(id, body, Buffer.byteLength(text));
  return Response.json(r.body, { status: r.status });
}
