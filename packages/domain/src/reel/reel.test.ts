import { describe, expect, it } from "vitest";
import {
  DEFAULT_REEL_PRESET,
  REEL_TRANSITIONS,
  REEL_TRANSITION_SEC,
  buildSrt,
  cleanCardText,
  computeReelLayout,
  formatSrtTime,
  insideSafeArea,
  keySentence,
  measureEm,
  planReel,
  reelLayoutIssues,
  reelPresetIssues,
  splitSentences,
  wrapSubtitle,
  type ReelPreset,
} from "./index";

const P = DEFAULT_REEL_PRESET;
const withPreset = (patch: Partial<ReelPreset>): ReelPreset => ({ ...P, ...patch });
const widthEm = (p: ReelPreset) => {
  const l = computeReelLayout(p);
  return (l.subtitleBox.w - p.subtitle.padPx * 2) / p.subtitle.fontSize;
};
const sentence = (chars: number) => `${"word ".repeat(Math.ceil(chars / 5)).slice(0, chars - 1).trim()}.`;

describe("프리셋", () => {
  it("기본값은 모순이 없고 docs/02 §4 의 가정(15~45초, 9:16)을 담는다", () => {
    expect(reelPresetIssues(P)).toEqual([]);
    expect(P.totalSec).toEqual({ min: 15, max: 45 });
    expect(P.canvas).toMatchObject({ width: 1080, height: 1920 });
    expect(P.audio.silentTrack).toBe(true);
  });

  it("모순된 값을 잡는다", () => {
    expect(reelPresetIssues(withPreset({ canvas: { width: 1080, height: 1350, fps: 30 } })).join()).toContain("9:16");
    expect(reelPresetIssues(withPreset({ totalSec: { min: 50, max: 45 } })).join()).toContain("전체 길이");
    expect(reelPresetIssues(withPreset({ scene: { ...P.scene, minSec: 1 } })).join()).toContain("전환 2번");
    expect(reelPresetIssues(withPreset({ safeArea: { top: 1000, bottom: 1000, left: 0, right: 0 } })).join()).toContain("안전영역");
  });

  it("전환 프리셋이 2종 이상이고 cut 은 겹침이 없다", () => {
    expect(REEL_TRANSITIONS.filter((t) => REEL_TRANSITION_SEC[t] > 0).length).toBeGreaterThanOrEqual(2);
    expect(REEL_TRANSITION_SEC.cut).toBe(0);
  });
});

describe("배치와 안전영역", () => {
  const layout = computeReelLayout(P);

  it("카드는 4:5 를 유지하고 짝수 크기이며, 카드·자막 상자 모두 안전영역 안이고 서로 겹치지 않는다", () => {
    expect(reelLayoutIssues(layout)).toEqual([]);
    expect(Math.abs(layout.card.w / layout.card.h - 0.8)).toBeLessThan(0.005);
    expect(layout.card.w % 2).toBe(0);
    expect(layout.card.h % 2).toBe(0);
    expect(layout.card.y + layout.card.h).toBeLessThanOrEqual(layout.subtitleBox.y);
  });

  it("안전영역 값 그대로의 경계를 지킨다 (상 270 · 하 380 · 좌우 64)", () => {
    expect(layout.safe).toEqual({ x: 64, y: 270, w: 952, h: 1270 });
    expect(layout.card.w).toBeGreaterThanOrEqual(layout.minCardWidth);
    expect(layout.subtitleBox.y + layout.subtitleBox.h).toBe(1920 - 380);
    expect(layout.card.y).toBeGreaterThanOrEqual(270);
    expect(layout.card.x).toBeGreaterThanOrEqual(64);
    expect(layout.card.x + layout.card.w).toBeLessThanOrEqual(1080 - 64);
  });

  it("안전영역을 넓히면 카드가 작아지고, 너무 좁히면 위반으로 잡힌다", () => {
    const wide = computeReelLayout(withPreset({ safeArea: { ...P.safeArea, bottom: 600 } }));
    expect(wide.card.h).toBeLessThan(layout.card.h);
    expect(reelLayoutIssues(wide)).toEqual([]);
    const tight = computeReelLayout(withPreset({ safeArea: { top: 800, bottom: 800, left: 64, right: 64 } }));
    expect(reelLayoutIssues(tight).length).toBeGreaterThan(0);
  });

  it("insideSafeArea 는 경계 상자가 안전영역을 벗어나면 거짓이다", () => {
    expect(insideSafeArea({ x: 100, y: 300, w: 800, h: 100 }, layout)).toBe(true);
    expect(insideSafeArea({ x: 100, y: 100, w: 800, h: 100 }, layout)).toBe(false);
    expect(insideSafeArea({ x: 100, y: 1500, w: 800, h: 100 }, layout)).toBe(false);
  });
});

describe("핵심 문장", () => {
  it("첫 문장을 뽑고 마크다운 기호를 걷는다", () => {
    expect(keySentence("**Rates** move first. Prices follow later.")).toBe("Rates move first.");
    expect(keySentence("- Inflation data lands Tuesday\n- Watch the core reading")).toBe("Inflation data lands Tuesday");
    expect(cleanCardText("a\n\n  b")).toBe("a b");
  });

  it("약어와 소수점에서는 문장을 끊지 않는다", () => {
    expect(splitSentences("The U.S. Fed holds at 3.5% for now. Next meeting is in June.")).toEqual(["The U.S. Fed holds at 3.5% for now.", "Next meeting is in June."]);
    expect(splitSentences("금리는 동결됐다. 다음 회의는 6월이다.")).toEqual(["금리는 동결됐다.", "다음 회의는 6월이다."]);
    expect(keySentence("")).toBe("");
  });
});

describe("자막 줄바꿈", () => {
  const em = widthEm(P);

  it("한 줄에 들어가면 그대로, 길면 줄 수 한도 안에서 단어 단위로 나눈다", () => {
    expect(wrapSubtitle("Short line.", em, P.subtitle)).toEqual({ lines: ["Short line."], truncated: false });
    const two = wrapSubtitle("Rate decisions shift expectations before they shift prices.", em, P.subtitle);
    expect(two.truncated).toBe(false);
    expect(two.lines.length).toBeGreaterThanOrEqual(2);
    expect(two.lines.length).toBeLessThanOrEqual(P.subtitle.maxLines);
    for (const line of two.lines) expect(measureEm(line, P.subtitle)).toBeLessThanOrEqual(em);
  });

  it("줄 수 한도를 넘으면 자르고 표시한다 — 절 경계를 먼저 쓰고, 말줄임표는 마지막 수단", () => {
    const clause = wrapSubtitle("The central bank may hold rates steady, but markets will read every word of the statement closely for hints.", em, P.subtitle);
    expect(clause.truncated).toBe(true);
    expect(clause.lines.length).toBeLessThanOrEqual(P.subtitle.maxLines);
    expect(clause.lines.join(" ")).not.toContain("…");
    const cut = wrapSubtitle("Supercalifragilistic expialidocious supercalifragilistic expialidocious supercalifragilistic expialidocious", em, P.subtitle);
    expect(cut.truncated).toBe(true);
    expect(cut.lines.length).toBeLessThanOrEqual(P.subtitle.maxLines);
    expect(cut.lines.join("").endsWith("…")).toBe(true);
  });

  it("한글은 폭이 넓어 같은 폭에 글자 수가 적게 들어간다", () => {
    expect(measureEm("가나다", P.subtitle)).toBeCloseTo(3);
    expect(measureEm("abc", P.subtitle)).toBeCloseTo(1.8);
    const ko = wrapSubtitle("기준금리는 동결됐지만 시장은 성명서의 문구 하나하나를 꼼꼼히 읽는다.", em, P.subtitle);
    expect(ko.lines.length).toBeGreaterThanOrEqual(2);
    for (const line of ko.lines) expect(measureEm(line, P.subtitle)).toBeLessThanOrEqual(em);
  });
});

describe("SRT", () => {
  it("시각을 HH:MM:SS,mmm 으로 쓴다", () => {
    expect(formatSrtTime(0)).toBe("00:00:00,000");
    expect(formatSrtTime(61_250)).toBe("00:01:01,250");
    expect(formatSrtTime(3_723_004)).toBe("01:02:03,004");
  });

  it("번호·시각·문장을 빈 줄로 나눈다", () => {
    expect(buildSrt([{ startMs: 500, endMs: 2500, text: "One\ntwo" }, { startMs: 3000, endMs: 4000, text: "Three" }])).toBe(
      "1\n00:00:00,500 --> 00:00:02,500\nOne\ntwo\n\n2\n00:00:03,000 --> 00:00:04,000\nThree\n",
    );
  });
});

describe("장면 계획 — 노출 시간", () => {
  const cards = (chars: number[]) => chars.map((c) => ({ text: sentence(c) }));

  it("글자가 많을수록 오래 보여 주되 장면 최소·최대 안에 둔다", () => {
    const plan = planReel(cards([12, 30, 58, 58, 58, 58]), P);
    const [a, b, c] = plan.scenes.map((s) => s.durationSec);
    expect(a!).toBeLessThan(b!);
    expect(b!).toBeLessThan(c!);
    for (const s of plan.scenes) {
      expect(s.durationSec).toBeGreaterThanOrEqual(P.scene.minSec);
      expect(s.durationSec).toBeLessThanOrEqual(P.scene.stretchMaxSec);
    }
  });

  it("카드 7장(표지+5단+출처)은 15~45초 안에 든다", () => {
    const plan = planReel(cards([40, 58, 58, 58, 58, 58, 20]), P);
    expect(plan.violations).toEqual([]);
    expect(plan.totalSec).toBeGreaterThanOrEqual(15);
    expect(plan.totalSec).toBeLessThanOrEqual(45);
  });

  it("카드가 적어 짧으면 장면 상한까지 늘려 15초를 맞춘다", () => {
    const plan = planReel(cards([20, 20, 20]), P);
    expect(plan.violations).toEqual([]);
    expect(plan.totalSec).toBeGreaterThanOrEqual(15);
    expect(Math.max(...plan.scenes.map((s) => s.durationSec))).toBeLessThanOrEqual(P.scene.stretchMaxSec);
  });

  it("카드 한 장은 15초를 못 채워 위반이다 / 카드가 너무 많으면 45초 초과 위반이다", () => {
    expect(planReel(cards([40]), P).violations.join()).toContain("reel/too-short");
    const many = planReel(cards(Array.from({ length: 20 }, () => 40)), P);
    expect(many.violations.join()).toContain("reel/too-long");
    expect(planReel([], P).violations).toEqual(["카드가 한 장도 없다"]);
  });

  it("너무 길면 장면 최소까지 줄여 45초 안에 맞춘다", () => {
    const plan = planReel(cards(Array.from({ length: 12 }, () => 58)), P);
    expect(plan.violations).toEqual([]);
    expect(plan.totalSec).toBeLessThanOrEqual(45);
  });
});

describe("장면 계획 — 시간축과 자막", () => {
  const cards = (chars: number[]) => chars.map((c) => ({ text: sentence(c) }));
  const input = [{ text: "First card sentence. More." }, { text: "Second card sentence here." }, { text: "Third one." }, { text: "Fourth and last." }];

  it("전환이 겹치는 만큼 전체가 짧아지고, 장면 시작은 앞 장면 길이 − 전환 길이만큼씩 밀린다", () => {
    const plan = planReel(input, P, { transition: "crossfade" });
    const t = plan.transitionFrames;
    expect(t).toBe(15);
    expect(plan.totalFrames).toBe(plan.scenes.reduce((a, s) => a + s.frames, 0) - 3 * t);
    plan.scenes.forEach((s, i) => {
      if (i > 0) expect(s.startFrame).toBe(plan.scenes[i - 1]!.startFrame + plan.scenes[i - 1]!.frames - t);
    });
    const last = plan.scenes.at(-1)!;
    expect(last.startFrame + last.frames).toBe(plan.totalFrames);
  });

  it("자막은 카드가 온전히 보이는 구간에서만 뜨고 서로 겹치지 않는다", () => {
    const plan = planReel(input, P, { transition: "slide" });
    const t = plan.transitionFrames;
    plan.scenes.forEach((s, i) => {
      const cue = s.cue!;
      expect(cue.startFrame).toBe(s.startFrame + (i > 0 ? t : 0));
      expect(cue.endFrame).toBe(s.startFrame + s.frames - (i < plan.scenes.length - 1 ? t : 0));
      expect(cue.endFrame - cue.startFrame).toBeGreaterThanOrEqual(plan.fps); // 최소 1초
      if (i > 0) expect(cue.startFrame).toBeGreaterThanOrEqual(plan.scenes[i - 1]!.cue!.endFrame);
    });
  });

  it("cut 은 겹침이 없어 자막이 장면 전체를 덮는다", () => {
    const plan = planReel(input, P, { transition: "cut" });
    expect(plan.transitionFrames).toBe(0);
    for (const s of plan.scenes) {
      expect(s.cue!.startFrame).toBe(s.startFrame);
      expect(s.cue!.endFrame).toBe(s.startFrame + s.frames);
    }
  });

  it("자막으로 쓸 문장이 없으면 자막 없이 두고 알린다, 한글에 서체 미확인이면 경고한다", () => {
    const plan = planReel([{ text: "" }, { text: "금리는 동결됐다." }, { text: "Third." }], P);
    expect(plan.scenes[0]!.cue).toBeNull();
    expect(plan.warnings.join("\n")).toContain("reel/no-subtitle");
    expect(plan.warnings.join("\n")).toContain("reel/font-glyphs");
    const ok = planReel([{ text: "금리는 동결됐다." }, { text: "다음." }, { text: "끝." }], { ...P, subtitle: { ...P.subtitle, coversHangul: true } });
    expect(ok.warnings.join("\n")).not.toContain("reel/font-glyphs");
  });

  it("긴 문장을 잘랐으면 경고한다", () => {
    const plan = planReel([{ text: `${"Supercalifragilistic ".repeat(8)}end.` }, { text: "Two." }, { text: "Three." }], P);
    expect(plan.warnings.join("\n")).toContain("reel/subtitle-truncated");
  });

  it("전환 프리셋마다 총 길이가 다르다 (같은 장면 길이에서 겹침만큼 차이)", () => {
    const long = cards([58, 58, 58, 58, 58]);
    const totals = REEL_TRANSITIONS.map((tr) => planReel(long, P, { transition: tr }).totalFrames);
    expect(new Set(totals).size).toBeGreaterThanOrEqual(3);
  });
});
