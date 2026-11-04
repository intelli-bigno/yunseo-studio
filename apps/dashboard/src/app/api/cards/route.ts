// 지금 미리보기에 쓸 카드 묶음(v2 우선).
import { activeCardSet } from "@/lib/cards";

export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json(activeCardSet(process.cwd(), process.env.CARD_V2_DIR));
}
