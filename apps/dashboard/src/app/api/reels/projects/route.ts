// [W3 릴스] 프로젝트 목록(GET) · 새로 만들기(POST {project})
import { emptyProject } from "@/lib/reels-timeline";
import { newReelsProjectId, reelsProjectProblems, reelsStore } from "@/server/reels";

export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json({ projects: reelsStore().list() });
}

export async function POST(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { project?: unknown };
  const project = body.project ?? emptyProject();
  const problems = reelsProjectProblems(project);
  if (problems.length) return Response.json({ error: "모양이 틀렸다", problems }, { status: 400 });
  const id = newReelsProjectId();
  const r = reelsStore().save({ id, title: (project as { title: string }).title.trim(), data: JSON.stringify(project) });
  return Response.json({ id, revision: r.revision, updatedAt: r.updatedAt }, { status: 201 });
}
