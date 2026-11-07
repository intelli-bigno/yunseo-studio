// [W3 릴스] 프로젝트 하나 — 불러오기(GET) · 저장(PUT {project, revision}) · 지우기(DELETE)
import { REELS_OPS_MAX_BYTES } from "@yunseo/application";
import type { ReelsProject } from "@/lib/reels-timeline";
import { readJsonObject } from "@/server/http";
import { isReelsProjectId, loadReelsProject, reelsProjectProblems, reelsStore } from "@/server/reels";
import { reelsOps } from "@/server/reels-ops";

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
  const read = await readJsonObject(req, REELS_OPS_MAX_BYTES);
  if (!read.ok) return read.response;
  const body = read.value;
  const problems = reelsProjectProblems(body.project);
  if (problems.length) return Response.json({ error: "모양이 틀렸다", problems }, { status: 400 });
  if (typeof body.revision !== "number") return Response.json({ error: "revision 이 없다" }, { status: 400 });
  // docs/12 §5 — 통째 저장도 op 로그에 {op:"replace_project"} 로 남겨 undo 가능하게. v2 편집을 잃는 덮어쓰기는 409
  const r = reelsOps().replaceProject(id, body.project as ReelsProject, body.revision);
  if (r.status !== 200) {
    const err = r.body.error as { code?: string; message?: string } | undefined;
    return Response.json({ error: err?.message ?? "저장 실패", code: err?.code, ...(r.body.revision !== undefined ? { revision: r.body.revision } : {}) }, { status: r.status });
  }
  return Response.json({ id, revision: r.body.revision, updatedAt: reelsStore().get(id)?.updatedAt, opId: r.body.opId, undo: r.body.undo });
}

export async function DELETE(_req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  return isReelsProjectId(id) && reelsStore().remove(id) ? new Response(null, { status: 204 }) : notFound();
}
