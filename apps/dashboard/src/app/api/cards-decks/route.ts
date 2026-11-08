// [cards] 덱 목록(GET)·새 덱(POST {title?, preset?})
import { badRequest, route } from "@/server/api";
import { KB, readJsonObject } from "@/server/http";
import { cardDecks } from "@/server/studio";

export const dynamic = "force-dynamic";

export const GET = route(async () => Response.json(await cardDecks().list()));

export const POST = route(async (req: Request) => {
  const body = await readJsonObject(req, 16 * KB, { emptyAs: {} });
  if (!body.ok) return body.response;
  const { title, preset } = body.value;
  if (title !== undefined && typeof title !== "string") throw badRequest("title 은 문자열이어야 한다");
  if (preset !== undefined && typeof preset !== "string") throw badRequest("preset 은 문자열이어야 한다");
  const record = await cardDecks().create({ title, preset });
  return Response.json(record, { status: 201 });
});
