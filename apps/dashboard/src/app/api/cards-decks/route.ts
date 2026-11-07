// [cards] 덱 목록(GET)·새 덱(POST {title?, preset?})
import { cardDecks } from "@/server/studio";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return Response.json(await cardDecks().list());
}

export async function POST(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { title?: unknown; preset?: unknown } | null;
  const record = await cardDecks().create(body && typeof body === "object" ? body : {});
  return Response.json(record, { status: 201 });
}
