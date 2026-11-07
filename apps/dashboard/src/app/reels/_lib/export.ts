// [릴스 편집기] 내보내기(렌더) — POST /api/reels/:id/export 로 지금 판을 1080x1920 MP4 + SRT 로 만들고, 결과는 GET /api/reels/:id/export/<판>/<video|srt> 로 받는다.
// 편집 명령(ops)이 아니라 별도 동작이다(docs/11 §3). 여기에는 fetch 한 겹과 주소·한 줄 요약만 둔다.

export interface ExportResult {
  revision: number;
  durationMs: number;
  warnings: string[];
  /** ffprobe 로 잰 결과 — 서버가 준 모양 그대로(화면은 해상도·길이만 쓴다) */
  probe?: { video?: { width?: number; height?: number; codec?: string } | null; audio?: unknown | null };
}

export type ExportOutcome = { ok: true; res: ExportResult } | { ok: false; status: number; message: string };

export const exportFileUrl = (projectId: string, revision: number, kind: "video" | "srt", download = false) =>
  `/api/reels/${encodeURIComponent(projectId)}/export/${revision}/${kind}${download ? "?dl=1" : ""}`;

export async function requestExport(projectId: string, signal?: AbortSignal | null): Promise<ExportOutcome> {
  let r: Response;
  try {
    r = await fetch(`/api/reels/${encodeURIComponent(projectId)}/export`, { method: "POST", signal: signal ?? null });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    return { ok: false, status: 0, message: "연결을 확인" };
  }
  const body = (await r.json().catch(() => null)) as (Partial<ExportResult> & { error?: { code?: string; message?: string } }) | null;
  if (r.ok && body && typeof body.revision === "number" && typeof body.durationMs === "number") return { ok: true, res: { revision: body.revision, durationMs: body.durationMs, warnings: body.warnings ?? [], ...(body.probe ? { probe: body.probe } : {}) } };
  const e = body?.error;
  return { ok: false, status: r.status, message: e ? `${e.code ?? "오류"}${e.message ? ` · ${e.message}` : ""}` : `응답 ${r.status}` };
}

/** 「1080x1920 · 24.0초 · 12판」 한 줄 */
export function exportSummary(res: ExportResult): string {
  const v = res.probe?.video;
  const size = v?.width && v?.height ? `${v.width}x${v.height} · ` : "";
  return `${size}${(res.durationMs / 1000).toFixed(1)}초 · ${res.revision}판`;
}
