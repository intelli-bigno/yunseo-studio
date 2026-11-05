import { describe, expect, it } from "vitest";
import { DEFAULT_REEL_PRESET, planReel } from "@yunseo/domain";
import { buildAss } from "./ass";
import { parseProbe, reelSpecIssues, type ReelSpecExpectation } from "./ffprobe";
import { readPngSize } from "./png";
import { solidPng } from "./testing";

describe("PNG 머리글", () => {
  it("크기를 읽는다", () => {
    expect(readPngSize(solidPng(1080, 1350, [1, 2, 3]))).toEqual({ width: 1080, height: 1350 });
  });
  it("PNG 가 아니거나 짧으면 null", () => {
    expect(readPngSize(new Uint8Array(10))).toBeNull();
    expect(readPngSize(Buffer.from("not a png file at all, just text of enough length"))).toBeNull();
  });
});

describe("ASS 자막 (번인용)", () => {
  const P = DEFAULT_REEL_PRESET;
  const plan = planReel([{ text: "Rates move first." }, { text: "Braces {x} and \\ slashes." }, { text: "Third card is here." }, { text: "" }, { text: "Fifth." }], P);
  const ass = buildAss(plan, P);

  it("PlayRes 가 영상 크기와 같아 값이 전부 픽셀이다", () => {
    expect(ass).toContain("PlayResX: 1080");
    expect(ass).toContain("PlayResY: 1920");
  });

  it("여백이 안전영역(+상자 여백)에서 나온다: 좌우 64+14, 아래 380+14", () => {
    const style = ass.split("\n").find((l) => l.startsWith("Style:"))!;
    const f = style.slice("Style: ".length).split(",");
    expect(f[1]).toBe(P.subtitle.fontName);
    expect(f[2]).toBe(String(P.subtitle.fontSize));
    // BorderStyle=3(상자) · Outline=14 · Shadow=0 · Alignment=2(아래 가운데) · MarginL/R=64+14 · MarginV=380+14
    expect(f.slice(15, 22)).toEqual(["3", "14", "0", "2", "78", "78", "394"]);
  });

  it("자막이 있는 장면만 Dialogue 가 되고 계획의 시각과 같다", () => {
    const lines = ass.split("\n").filter((l) => l.startsWith("Dialogue:"));
    expect(lines.length).toBe(4); // 4번째 카드는 문장이 없다
    expect(lines[0]).toMatch(/^Dialogue: 0,0:00:00\.00,0:00:0\d\.\d\d,Default,,0,0,0,,Rates move first\.$/);
  });

  it("ASS 효과 문자는 글자로 쓰지 않는다", () => {
    expect(ass).toContain("Braces (x) and / slashes.");
    expect(ass).not.toContain("{x}");
  });
});

describe("ffprobe 해석과 규격 검사", () => {
  const good = JSON.stringify({
    streams: [
      { codec_type: "video", codec_name: "h264", profile: "High", width: 1080, height: 1920, pix_fmt: "yuv420p", avg_frame_rate: "30/1", duration: "20.000000", nb_frames: "600" },
      { codec_type: "audio", codec_name: "aac", sample_rate: "48000", channels: 2 },
    ],
    format: { duration: "20.021000", format_name: "mov,mp4,m4a,3gp,3g2,mj2" },
  });
  const want: ReelSpecExpectation = { width: 1080, height: 1920, fps: 30, durationSec: 20, toleranceSec: 0.5, expectAudio: true };

  it("영상·오디오 스트림을 요약한다", () => {
    const p = parseProbe(good);
    expect(p.video).toMatchObject({ codec: "h264", width: 1080, height: 1920, pixFmt: "yuv420p", fps: 30, durationSec: 20, frames: 600 });
    expect(p.audio).toEqual({ codec: "aac", sampleRate: 48000, channels: 2 });
    expect(p.formatDurationSec).toBeCloseTo(20.021);
  });

  it("규격에 맞으면 통과한다", () => {
    expect(reelSpecIssues(parseProbe(good), want)).toEqual([]);
  });

  it("해상도·코덱·길이·오디오가 어긋나면 각각 잡는다", () => {
    const bad = JSON.stringify({
      streams: [{ codec_type: "video", codec_name: "hevc", width: 720, height: 1280, pix_fmt: "yuv444p", avg_frame_rate: "25/1", duration: "9" }],
      format: { duration: "9" },
    });
    const issues = reelSpecIssues(parseProbe(bad), want).join("\n");
    expect(issues).toContain("h264");
    expect(issues).toContain("1080x1920");
    expect(issues).toContain("yuv420p");
    expect(issues).toContain("프레임률");
    expect(issues).toContain("길이가");
    expect(issues).toContain("오디오 트랙이 aac 가 아니다");
    expect(reelSpecIssues(parseProbe(good), { ...want, expectAudio: false })).toEqual(["오디오 트랙이 없어야 하는데 있다"]);
    expect(reelSpecIssues(parseProbe("{}"), want)).toEqual(["영상 스트림이 없다"]);
  });
});
