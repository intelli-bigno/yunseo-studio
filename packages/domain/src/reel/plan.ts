// 장면 계획 — 카드별 노출 시간·전환·자막 시각을 정한다(순수 함수, 외부 의존 0).
// 시간은 프레임(정수)으로 계산해 전환 겹침이 어긋나지 않게 한다.
import { computeReelLayout } from "./layout";
import { REEL_TRANSITION_SEC, type ReelPreset, type ReelTransitionName } from "./preset";
import { hasHangul, keySentence, measureEm, wrapSubtitle } from "./text";

export interface ReelCardText {
  /** 카드 텍스트 — 지금은 카드의 대체 텍스트(altText). 이 안의 첫 문장이 자막이 된다 */
  text: string;
}

export interface ReelCue {
  /** 출력 시간축(초) — 카드가 온전히 보이는 구간 안에서만 뜬다 */
  startSec: number;
  endSec: number;
  startFrame: number;
  endFrame: number;
  lines: string[];
}

export interface ReelScenePlan {
  index: number;
  /** 이 카드를 읽어 들이는 길이(프레임·초). 앞뒤 전환과 겹치는 부분을 포함한다 */
  frames: number;
  durationSec: number;
  /** 출력 시간축에서 이 장면이 시작되는 시각(앞 장면과의 겹침이 시작되는 곳) */
  startFrame: number;
  startSec: number;
  cue: ReelCue | null;
}

export interface ReelPlan {
  fps: number;
  transition: ReelTransitionName;
  transitionFrames: number;
  transitionSec: number;
  scenes: ReelScenePlan[];
  totalFrames: number;
  totalSec: number;
  /** 지키지 못한 규칙 — 있으면 합성을 막는다 */
  violations: string[];
  /** 사람이 읽고 판단할 것 */
  warnings: string[];
}

export interface PlanOptions {
  transition?: ReelTransitionName;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** 자막 글자가 들어가는 폭(em) */
function subtitleWidthEm(preset: ReelPreset): number {
  const layout = computeReelLayout(preset);
  return (layout.subtitleBox.w - preset.subtitle.padPx * 2) / preset.subtitle.fontSize;
}

export function planReel(cards: readonly ReelCardText[], preset: ReelPreset, options: PlanOptions = {}): ReelPlan {
  const { fps } = preset.canvas;
  const transition = options.transition ?? preset.transition;
  const transitionFrames = Math.round(REEL_TRANSITION_SEC[transition] * fps);
  const violations: string[] = [];
  const warnings: string[] = [];
  const n = cards.length;

  if (n === 0) {
    return { fps, transition, transitionFrames, transitionSec: 0, scenes: [], totalFrames: 0, totalSec: 0, violations: ["카드가 한 장도 없다"], warnings };
  }

  const widthEm = subtitleWidthEm(preset);
  const wrapped = cards.map((c, i) => {
    const sentence = keySentence(c.text);
    if (!sentence) {
      warnings.push(`reel/no-subtitle: ${i + 1}번 카드에 자막으로 쓸 문장이 없다`);
      return { lines: [] as string[], em: 0 };
    }
    const w = wrapSubtitle(sentence, widthEm, preset.subtitle);
    if (w.truncated) warnings.push(`reel/subtitle-truncated: ${i + 1}번 카드의 핵심 문장이 ${preset.subtitle.maxLines}줄에 안 들어가 줄였다 — 의미가 바뀌지 않았는지 확인`);
    if (!preset.subtitle.coversHangul && hasHangul(w.lines.join(""))) {
      warnings.push(`reel/font-glyphs: ${i + 1}번 카드 자막에 한글이 있는데 서체(${preset.subtitle.fontName})가 한글을 그린다고 확인되지 않았다 — 네모(□)로 나올 수 있다`);
    }
    return { lines: w.lines, em: measureEm(w.lines.join(" "), preset.subtitle) };
  });

  // 1) 글자 수 기반 노출 시간 → 프레임. 한 글자 = 라틴 기준 폭 1 이므로 em / latinWidthEm 을 글자 수로 쓴다
  const s = preset.scene;
  const minF = Math.round(s.minSec * fps);
  const maxF = Math.round(s.maxSec * fps);
  const stretchF = Math.round(s.stretchMaxSec * fps);
  const frames = wrapped.map((w) => {
    const chars = w.em / preset.subtitle.latinWidthEm;
    const sec = s.baseSec + chars / s.charsPerSec;
    return Math.min(maxF, Math.max(minF, Math.round(sec * fps)));
  });

  const total = () => frames.reduce((a, b) => a + b, 0) - (n - 1) * transitionFrames;
  const minTotalF = Math.round(preset.totalSec.min * fps);
  const maxTotalF = Math.round(preset.totalSec.max * fps);

  // 2) 전체 길이 맞추기 — 한 프레임씩 가장 짧은(늘릴 때)/긴(줄일 때) 장면에 보탠다. 비례가 유지된다
  while (total() < minTotalF) {
    let pick = -1;
    for (let i = 0; i < n; i++) if (frames[i]! < stretchF && (pick < 0 || frames[i]! < frames[pick]!)) pick = i;
    if (pick < 0) break;
    frames[pick]!++;
  }
  while (total() > maxTotalF) {
    let pick = -1;
    for (let i = 0; i < n; i++) if (frames[i]! > minF && (pick < 0 || frames[i]! > frames[pick]!)) pick = i;
    if (pick < 0) break;
    frames[pick]!--;
  }
  const totalFrames = total();
  if (totalFrames < minTotalF) {
    violations.push(`reel/too-short: 카드 ${n}장으로는 최소 ${preset.totalSec.min}초에 못 미친다(${round3(totalFrames / fps)}초) — 장면당 상한 ${s.stretchMaxSec}초`);
  }
  if (totalFrames > maxTotalF) {
    violations.push(`reel/too-long: 카드 ${n}장은 최소 노출 시간으로도 ${preset.totalSec.max}초를 넘는다(${round3(totalFrames / fps)}초) — 카드 수를 줄여야 한다`);
  }

  // 3) 시간축과 자막 시각. 카드가 온전히 보이는 구간(앞 전환이 끝난 뒤 ~ 뒤 전환이 시작되기 전)에만 자막을 띄운다
  let startFrame = 0;
  const scenes: ReelScenePlan[] = frames.map((f, i) => {
    const cueStart = startFrame + (i > 0 ? transitionFrames : 0);
    const cueEnd = startFrame + f - (i < n - 1 ? transitionFrames : 0);
    const lines = wrapped[i]!.lines;
    const scene: ReelScenePlan = {
      index: i,
      frames: f,
      durationSec: round3(f / fps),
      startFrame,
      startSec: round3(startFrame / fps),
      cue: lines.length === 0 ? null : { startFrame: cueStart, endFrame: cueEnd, startSec: round3(cueStart / fps), endSec: round3(cueEnd / fps), lines },
    };
    startFrame += f - transitionFrames;
    return scene;
  });

  return { fps, transition, transitionFrames, transitionSec: round3(transitionFrames / fps), scenes, totalFrames, totalSec: round3(totalFrames / fps), violations, warnings };
}
