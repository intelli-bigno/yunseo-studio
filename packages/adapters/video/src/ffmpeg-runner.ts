// ffmpeg·ffprobe 실행 — 프로세스를 띄우는 곳은 여기뿐이다. 셸을 거치지 않는다.
import { spawn } from "node:child_process";
import { parseProbe, type ProbeSummary } from "./ffprobe";

export interface FfmpegBinaries {
  ffmpegPath: string;
  ffprobePath: string;
}

export const DEFAULT_BINARIES: FfmpegBinaries = { ffmpegPath: "ffmpeg", ffprobePath: "ffprobe" };

export interface ProcessResult {
  code: number | null;
  stdout: string;
  stderr: string;
  /** 실행 파일을 못 찾는 등 시작 자체가 실패했을 때 */
  spawnError: string | null;
}

export function runProcess(command: string, args: readonly string[], options: { cwd?: string; timeoutMs?: number } = {}): Promise<ProcessResult> {
  return new Promise((resolve) => {
    const child = spawn(command, [...args], { cwd: options.cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (result: ProcessResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish({ code: null, stdout, stderr: `${stderr}\n[시간 초과 ${options.timeoutMs}ms]`, spawnError: null });
    }, options.timeoutMs ?? 600_000);
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString("utf8")));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString("utf8")));
    child.on("error", (e) => finish({ code: null, stdout, stderr, spawnError: e.message }));
    child.on("close", (code) => finish({ code, stdout, stderr, spawnError: null }));
  });
}

/** ffmpeg 가 없거나 필요한 기능이 빠졌을 때 — 메시지가 곧 해결 방법이다 */
export class FfmpegUnavailableError extends Error {
  override name = "FfmpegUnavailableError";
}

export const REQUIRED_FILTERS = ["xfade", "overlay", "gblur", "eq", "anullsrc", "amix"] as const;
export const REQUIRED_ENCODERS = ["libx264", "aac"] as const;

const word = (haystack: string, name: string) => new RegExp(`\\s${name}\\s`).test(haystack);

/**
 * 합성 전에 ffmpeg 를 점검한다. 없으면 건너뛰지 않고 이유와 해결 방법을 담아 던진다.
 * @returns ffmpeg 버전 첫 줄
 */
export async function assertFfmpegReady(bins: FfmpegBinaries, need: { burnIn: boolean }): Promise<string> {
  const hint =
    "릴스 합성은 ffmpeg 가 있는 Windows 실행기에서 한다(`win auto -- …`). 실행기에는 /usr/bin/ffmpeg 가 설치돼 있다(2026-11-05 실측 6.1.1). " +
    "다른 위치의 ffmpeg 를 쓰려면 FFMPEG_PATH·FFPROBE_PATH 환경 변수로 경로를 준다. 시스템에 새로 설치하지 않는다.";
  const version = await runProcess(bins.ffmpegPath, ["-hide_banner", "-version"], { timeoutMs: 15_000 });
  if (version.spawnError !== null || version.code !== 0) {
    throw new FfmpegUnavailableError(`ffmpeg 를 실행할 수 없다(${bins.ffmpegPath}): ${version.spawnError ?? version.stderr.trim()}\n${hint}`);
  }
  const probe = await runProcess(bins.ffprobePath, ["-hide_banner", "-version"], { timeoutMs: 15_000 });
  if (probe.spawnError !== null || probe.code !== 0) {
    throw new FfmpegUnavailableError(`ffprobe 를 실행할 수 없다(${bins.ffprobePath}): ${probe.spawnError ?? probe.stderr.trim()}\n${hint}`);
  }
  const filters = (await runProcess(bins.ffmpegPath, ["-hide_banner", "-filters"], { timeoutMs: 15_000 })).stdout;
  const encoders = (await runProcess(bins.ffmpegPath, ["-hide_banner", "-encoders"], { timeoutMs: 15_000 })).stdout;
  const missing = [
    ...[...REQUIRED_FILTERS, ...(need.burnIn ? (["subtitles"] as const) : [])].filter((f) => !word(filters, f)).map((f) => `필터 ${f}`),
    ...REQUIRED_ENCODERS.filter((e) => !word(encoders, e)).map((e) => `인코더 ${e}`),
  ];
  if (missing.length > 0) throw new FfmpegUnavailableError(`ffmpeg(${bins.ffmpegPath})에 필요한 기능이 없다: ${missing.join(", ")}\n${hint}`);
  return version.stdout.split("\n")[0] ?? "";
}

export async function probeMedia(bins: FfmpegBinaries, file: string): Promise<ProbeSummary> {
  const r = await runProcess(bins.ffprobePath, ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file], { timeoutMs: 60_000 });
  if (r.spawnError !== null || r.code !== 0) throw new Error(`ffprobe 실패(${file}): ${r.spawnError ?? r.stderr.trim()}`);
  return parseProbe(r.stdout);
}
