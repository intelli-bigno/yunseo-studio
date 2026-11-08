// [W3 릴스] 프로젝트 하나 — 불러오기(GET) · 저장(PUT {project, revision}) · 지우기(DELETE)
import { REELS_OPS_MAX_BYTES } from "@yunseo/application";
import type { ReelsProject } from "@yunseo/application/reels-timeline";
import { badRequest, notFound, route } from "@/server/api";
import { invalidProject, opsFailure } from "@/server/failures";
import { readJsonObject } from "@/server/http";
import { isReelsProjectId, loadReelsProject, reelsProjectProblems, reelsStore } from "@/server/reels";
import { reelsOps } from "@/server/reels-ops";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
const missing = (id: string) => notFound("PROJECT_NOT_FOUND", `${id} 없음`);

export const GET = route(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const r = loadReelsProject(id);
  if (!r) throw missing(id);
  return Response.json(r);
});

export const PUT = route(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  if (!isReelsProjectId(id) || !reelsStore().get(id)) throw missing(id);
  const read = await readJsonObject(req, REELS_OPS_MAX_BYTES);
  if (!read.ok) return read.response;
  const body = read.value;
  const problems = reelsProjectProblems(body.project);
  if (problems.length) throw invalidProject(problems);
  if (typeof body.revision !== "number") throw badRequest("revision 이 없다");
  // docs/12 §5 — 통째 저장도 op 로그에 {op:"replace_project"} 로 남겨 undo 가능하게. v2 편집을 잃는 덮어쓰기는 409
  const r = reelsOps().replaceProject(id, body.project as ReelsProject, body.revision);
  if (r.status !== 200) throw opsFailure(r);
  return Response.json({ id, revision: r.body.revision, updatedAt: reelsStore().get(id)?.updatedAt, opId: r.body.opId, undo: r.body.undo });
});

export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  if (!isReelsProjectId(id) || !reelsStore().remove(id)) throw missing(id);
  return new Response(null, { status: 204 });
});
