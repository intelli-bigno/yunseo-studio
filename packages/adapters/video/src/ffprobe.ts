// ffprobe 결과 해석 — 파싱은 순수 함수, 실행은 ffmpeg-runner.
export interface ProbeSummary {
  video: { codec: string; profile: string | null; width: number; height: number; pixFmt: string; fps: number; durationSec: number | null; frames: number | null } | null;
  audio: { codec: string; sampleRate: number; channels: number } | null;
  formatDurationSec: number | null;
  formatName: string | null;
}

interface RawStream {
  codec_type?: string;
  codec_name?: string;
  profile?: string;
  width?: number;
  height?: number;
  pix_fmt?: string;
  r_frame_rate?: string;
  avg_frame_rate?: string;
  duration?: string;
  nb_frames?: string;
  sample_rate?: string;
  channels?: number;
}

const num = (v: string | undefined): number | null => {
  if (v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function parseRate(rate: string | undefined): number {
  const [a, b] = (rate ?? "").split("/").map(Number);
  return a !== undefined && b !== undefined && b !== 0 && Number.isFinite(a / b) ? a / b : 0;
}

/** `ffprobe -print_format json -show_format -show_streams` 출력 → 요약 */
export function parseProbe(json: string): ProbeSummary {
  const raw = JSON.parse(json) as { streams?: RawStream[]; format?: { duration?: string; format_name?: string } };
  const streams = raw.streams ?? [];
  const v = streams.find((s) => s.codec_type === "video");
  const a = streams.find((s) => s.codec_type === "audio");
  return {
    video: v
      ? {
          codec: v.codec_name ?? "",
          profile: v.profile ?? null,
          width: v.width ?? 0,
          height: v.height ?? 0,
          pixFmt: v.pix_fmt ?? "",
          fps: parseRate(v.avg_frame_rate ?? v.r_frame_rate),
          durationSec: num(v.duration),
          frames: num(v.nb_frames),
        }
      : null,
    audio: a ? { codec: a.codec_name ?? "", sampleRate: Number(a.sample_rate ?? 0), channels: a.channels ?? 0 } : null,
    formatDurationSec: num(raw.format?.duration),
    formatName: raw.format?.format_name ?? null,
  };
}

export interface ReelSpecExpectation {
  width: number;
  height: number;
  /** 계획된 길이(초). 허용 오차 안이어야 한다 */
  durationSec: number;
  toleranceSec: number;
  fps: number;
  expectAudio: boolean;
}

/** 산출 영상이 규격을 지키는지 — 어긋난 항목을 말로 돌려준다. 빈 배열이면 통과 */
export function reelSpecIssues(probe: ProbeSummary, want: ReelSpecExpectation): string[] {
  const issues: string[] = [];
  const v = probe.video;
  if (!v) return ["영상 스트림이 없다"];
  if (v.codec !== "h264") issues.push(`영상 코덱이 h264 가 아니다: ${v.codec}`);
  if (v.width !== want.width || v.height !== want.height) issues.push(`해상도가 ${want.width}x${want.height} 가 아니다: ${v.width}x${v.height}`);
  if (v.pixFmt !== "yuv420p") issues.push(`픽셀 형식이 yuv420p 가 아니다: ${v.pixFmt}`);
  if (Math.abs(v.fps - want.fps) > 0.01) issues.push(`프레임률이 ${want.fps} 가 아니다: ${v.fps}`);
  const duration = v.durationSec ?? probe.formatDurationSec;
  if (duration === null || Math.abs(duration - want.durationSec) > want.toleranceSec) issues.push(`길이가 계획(${want.durationSec}초)과 다르다: ${duration ?? "알 수 없음"}초`);
  if (want.expectAudio && probe.audio?.codec !== "aac") issues.push(`오디오 트랙이 aac 가 아니다: ${probe.audio?.codec ?? "없음"}`);
  if (!want.expectAudio && probe.audio) issues.push("오디오 트랙이 없어야 하는데 있다");
  return issues;
}
