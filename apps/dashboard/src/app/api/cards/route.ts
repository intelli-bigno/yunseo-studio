// 지금 미리보기에 쓸 카드 묶음(v2 우선). 파일 존재에 따라 달라지므로 요청마다 확인한다(값싸다).
import { studio } from "@/server/studio";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return Response.json(await studio().getCardSet());
}
