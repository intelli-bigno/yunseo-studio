// ffmpeg 실패를 종류별 코드로 — 시간 초과·실행 불가·비정상 종료. 진짜 ffmpeg 없이 node 를 대신 띄워 시험한다.
import { AppError } from "@yunseo/domain";
import { describe, expect, it } from "vitest";
import { FfmpegRunError, FfmpegUnavailableError, assertFfmpegReady, probeMedia, runProcess, tailOf } from "./ffmpeg-runner";

const node = process.execPath;

describe("runProcess", () => {
  it("시간 제한을 넘기면 강제로 끝내고 timedOut 으로 표시한다", async () => {
    const r = await runProcess(node, ["-e", "setTimeout(() => {}, 10000)"], { timeoutMs: 200 });
    expect(r).toMatchObject({ code: null, timedOut: true, spawnError: null });
    expect(r.stderr).toContain("시간 초과 200ms");
  });

  it("실행 파일이 없으면 spawnError, 시간 초과는 아니다", async () => {
    const r = await runProcess("definitely-not-a-binary-xyz", []);
    expect(r.spawnError).not.toBeNull();
    expect(r).toMatchObject({ code: null, timedOut: false });
  });

  it("비정상 종료 코드와 stderr 를 그대로 돌려준다", async () => {
    const r = await runProcess(node, ["-e", "console.error('boom'); process.exit(3)"]);
    expect(r).toMatchObject({ code: 3, timedOut: false, spawnError: null });
    expect(r.stderr).toContain("boom");
  });
});

describe("FfmpegRunError — 실패 종류가 코드로 갈린다", () => {
  it("시간 초과 → FFMPEG_TIMEOUT(504)", () => {
    expect(new FfmpegRunError("느림", { code: null, spawnError: null, timedOut: true })).toMatchObject({ code: "FFMPEG_TIMEOUT", status: 504 });
  });

  it("실행 파일을 못 띄움 → FFMPEG_UNAVAILABLE(503)", () => {
    expect(new FfmpegRunError("없음", { code: null, spawnError: "spawn ffmpeg ENOENT", timedOut: false })).toMatchObject({ code: "FFMPEG_UNAVAILABLE", status: 503 });
  });

  it("비정상 종료 → FFMPEG_FAILED(500) + 종료 코드를 details 에", () => {
    const e = new FfmpegRunError("실패", { code: 1, spawnError: null, timedOut: false });
    expect(e).toBeInstanceOf(AppError);
    expect(e).toMatchObject({ code: "FFMPEG_FAILED", status: 500, details: { exitCode: 1 } });
  });

  it("stderr 는 끝 n 줄만 메시지에 싣는다", () => {
    expect(tailOf("a\nb\nc\nd\n", 2)).toBe("c\nd");
  });
});

describe("점검·ffprobe 실패", () => {
  it("ffmpeg 가 없으면 FfmpegUnavailableError(FFMPEG_UNAVAILABLE) — 해결 방법(FFMPEG_PATH)이 메시지에 있다", async () => {
    const e = await assertFfmpegReady({ ffmpegPath: "no-such-ffmpeg-xyz", ffprobePath: "no-such-ffprobe-xyz" }, { burnIn: false }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(FfmpegUnavailableError);
    expect(e).toMatchObject({ code: "FFMPEG_UNAVAILABLE", status: 503, message: expect.stringContaining("FFMPEG_PATH") });
  });

  it("ffprobe 를 못 띄우면 FfmpegRunError(FFMPEG_UNAVAILABLE) — 평범한 Error 가 아니다", async () => {
    const e = await probeMedia({ ffmpegPath: "x", ffprobePath: "no-such-ffprobe-xyz" }, "a.mp4").catch((x: unknown) => x);
    expect(e).toBeInstanceOf(FfmpegRunError);
    expect(e).toMatchObject({ code: "FFMPEG_UNAVAILABLE", message: expect.stringContaining("ffprobe 실패(a.mp4)") });
  });
});
