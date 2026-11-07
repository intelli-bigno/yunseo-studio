// [W3 릴스] 프로젝트 하나 — 불러오기(GET) · 저장(PUT {project, revision}) · 지우기(DELETE)
import { isReelsProjectId, loadReelsProject, reelsProjectProblems, reelsStore, ReelsRevisionConflictError } from "@/server/reels";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
const notFound = () => Response.json({ error: "없다" }, { status: 404 });

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  const r = loadReelsProject((await ctx.params).id);
  return r ? Response.json(r) : notFound();
}

export async function PUT(req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  if (!isReelsProjectId(id) || !reelsStore().get(id)) return notFound();
  const body = (await req.json().catch(() => ({}))) as { project?: unknown; revision?: unknown };
  const problems = reelsProjectProblems(body.project);
  if (problems.length) return Response.json({ error: "모양이 틀렸다", problems }, { status: 400 });
  if (typeof body.revision !== "number") return Response.json({ error: "revision 이 없다" }, { status: 400 });
  try {
    const r = reelsStore().save({ id, title: (body.project as { title: string }).title.trim(), data: JSON.stringify(body.project), expectedRevision: body.revision });
    return Response.json({ id, revision: r.revision, updatedAt: r.updatedAt });
  } catch (e) {
    if (e instanceof ReelsRevisionConflictError) return Response.json({ error: e.message, revision: e.current }, { status: 409 });
    throw e;
  }
}

export async function DELETE(_req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  return isReelsProjectId(id) && reelsStore().remove(id) ? new Response(null, { status: 204 }) : notFound();
}
