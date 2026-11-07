// [cards] 덱 하나 — 불러오기(GET)·저장(PUT {deck, revision}: 400 검증·404 없음·409 다른 곳에서 먼저 저장)·삭제(DELETE)
import { cardDecks } from "@/server/studio";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  const record = await cardDecks().open((await ctx.params).id);
  return record ? Response.json(record) : Response.json({ error: "not found" }, { status: 404 });
}

export async function PUT(req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { deck?: unknown; revision?: unknown } | null;
  if (!body || typeof body !== "object") return Response.json({ errors: ["본문이 JSON 이 아님"] }, { status: 400 });
  const r = await cardDecks().save(id, body.deck, body.revision);
  if (r.ok) return Response.json(r.record);
  return Response.json(r, { status: r.status });
}

export async function DELETE(_req: Request, ctx: Ctx): Promise<Response> {
  const removed = await cardDecks().remove((await ctx.params).id);
  return removed ? new Response(null, { status: 204 }) : Response.json({ error: "not found" }, { status: 404 });
}
