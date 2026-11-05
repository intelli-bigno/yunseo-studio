// 설치 앱 아이콘(기기에서 수집한 PNG)
import { appIconAsset, fileResponse } from "@/server/library";

export async function GET(req: Request, ctx: { params: Promise<{ machine: string; file: string }> }): Promise<Response> {
  const { machine, file } = await ctx.params;
  return fileResponse(req, appIconAsset(machine, file));
}
