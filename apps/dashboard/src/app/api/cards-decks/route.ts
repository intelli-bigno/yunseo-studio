// [cards] 덱 목록(GET)·새 덱(POST {title?, preset?})
import { KB, readJsonObject } from "@/server/http";
import { cardDecks } from "@/server/studio";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return Response.json(await cardDecks().list());
}

export async function POST(req: Request): Promise<Response> {
  const body = await readJsonObject(req, 16 * KB, { emptyAs: {} });
  if (!body.ok) return body.response;
  const { title, preset } = body.value;
  if (title !== undefined && typeof title !== "string") return Response.json({ errors: ["title 은 문자열"] }, { status: 400 });
  if (preset !== undefined && typeof preset !== "string") return Response.json({ errors: ["preset 은 문자열"] }, { status: 400 });
  const record = await cardDecks().create({ title, preset });
  return Response.json(record, { status: 201 });
}
