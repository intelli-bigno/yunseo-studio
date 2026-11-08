// [W5 릴스] 오디오 전용 자산(BGM·내레이션) — 저장소 assets/audio/<bgm|narration>/<파일>. 구간 요청(Range) 지원
import { route } from "@/server/api";
import { fileResponse } from "@/server/library";
import { reelsAudioAsset } from "@/server/reels";

export const GET = route(async (req: Request, ctx: { params: Promise<{ kind: string; file: string }> }) => {
  const { kind, file } = await ctx.params;
  return fileResponse(req, reelsAudioAsset(kind, file));
});
