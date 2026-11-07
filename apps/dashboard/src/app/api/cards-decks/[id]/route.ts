// [cards] 덱 하나 — 불러오기(GET)·저장(PUT {deck, revision}: 400 검증·404 없음·409 다른 곳에서 먼저 저장)·삭제(DELETE)
import { KB, readJsonObject } from "@/server/http";
import { cardDecks } from "@/server/studio";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
/** 덱 상한(DECK_LIMITS: 카드 30 × 레이어 40 × 글 2000자, 한글 3바이트) 최악값 ≈ 7.2MB 에 여유를 둔 값 */
export const CARD_DECK_MAX_BYTES = 8 * KB * KB;

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  const record = await cardDecks().open((await ctx.params).id);
  return record ? Response.json(record) : Response.json({ error: "not found" }, { status: 404 });
}

export async function PUT(req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  const body = await readJsonObject(req, CARD_DECK_MAX_BYTES);
  if (!body.ok) return body.response;
  const r = await cardDecks().save(id, body.value.deck, body.value.revision);
  if (r.ok) return Response.json(r.record);
  return Response.json(r, { status: r.status });
}

export async function DELETE(_req: Request, ctx: Ctx): Promise<Response> {
  const removed = await cardDecks().remove((await ctx.params).id);
  return removed ? new Response(null, { status: 204 }) : Response.json({ error: "not found" }, { status: 404 });
}
