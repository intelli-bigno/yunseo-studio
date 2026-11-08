// [cards] 덱 하나 — 불러오기(GET)·저장(PUT {deck, revision}: 400 검증·404 없음·409 다른 곳에서 먼저 저장)·삭제(DELETE)
import { notFound, route } from "@/server/api";
import { deckSaveFailure } from "@/server/failures";
import { readJsonObject } from "@/server/http";
import { CARD_DECK_MAX_BYTES } from "@/server/limits";
import { cardDecks } from "@/server/studio";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
const missing = (id: string) => notFound("DECK_NOT_FOUND", `${id} 없음`);

export const GET = route(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const record = await cardDecks().open(id);
  if (!record) throw missing(id);
  return Response.json(record);
});

export const PUT = route(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const body = await readJsonObject(req, CARD_DECK_MAX_BYTES);
  if (!body.ok) return body.response;
  const r = await cardDecks().save(id, body.value.deck, body.value.revision);
  if (r.ok) return Response.json(r.record);
  throw deckSaveFailure(r);
});

export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  if (!(await cardDecks().remove(id))) throw missing(id);
  return new Response(null, { status: 204 });
});
