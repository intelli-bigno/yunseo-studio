// 릴스·Shorts 합성 프리셋 — 값은 전부 여기 한 곳이다(docs/02 §4, docs/08 D6·D16).
// `[미검증]` 표시는 공식 문서·실측으로 아직 확인하지 않은 가정이다. 첫 편을 올려 본 뒤 이 값만 고치면 된다.

export const REEL_TRANSITIONS = ["cut", "crossfade", "dip", "slide"] as const;
export type ReelTransitionName = (typeof REEL_TRANSITIONS)[number];

/** 전환 길이(초). 어댑터가 이름을 영상 도구의 전환 효과로 옮긴다 — 도메인은 도구를 모른다 */
export const REEL_TRANSITION_SEC: Readonly<Record<ReelTransitionName, number>> = {
  cut: 0,
  crossfade: 0.5,
  dip: 0.6,
  slide: 0.4,
};

export interface ReelPreset {
  /** 출력 캔버스. 9:16 */
  canvas: { width: number; height: number; fps: number };
  /** 입력 카드(4:5) 크기 — 비율 점검용 */
  cardSource: { width: number; height: number };
  /** 카드가 캔버스 너비에서 차지해야 하는 최소 비율 — 이보다 작아지면 카드 글자를 못 읽는다 */
  cardMinWidthRatio: number;
  /** 플랫폼 UI 가 가리는 가장자리(px). 자막과 카드는 이 안쪽에 놓는다 */
  safeArea: { top: number; bottom: number; left: number; right: number };
  /** 영상 전체 길이 한도(초) */
  totalSec: { min: number; max: number };
  /** 카드 한 장의 노출 시간 = clamp(baseSec + 자막 글자 폭 / charsPerSec, minSec, maxSec) */
  scene: { minSec: number; maxSec: number; baseSec: number; charsPerSec: number; stretchMaxSec: number };
  transition: ReelTransitionName;
  subtitle: {
    fontName: string;
    fontSize: number;
    maxLines: number;
    /** 자막 상자 안쪽 여백(px) */
    padPx: number;
    lineHeightEm: number;
    /** 카드와 자막 사이(px) */
    gapPx: number;
    /** 글자 폭 추정(em): 라틴 글자 / 한글·한자·전각 */
    latinWidthEm: number;
    wideWidthEm: number;
    /** 영상에 자막을 구워 넣는가(SRT 파일은 항상 따로 낸다) */
    burnIn: boolean;
    /** 쓰는 서체가 한글을 그리는가. false 인데 한글이 있으면 경고 */
    coversHangul: boolean;
  };
  /** 4:5 카드 뒤 배경 — 같은 카드를 흐리고 어둡게 깐다(새 색을 만들지 않는다) */
  background: { blurSigma: number; dim: number };
  audio: {
    /** 음성·음악이 없어도 무음 AAC 트랙을 넣는다 */
    silentTrack: boolean;
    sampleRate: number;
    bitrateKbps: number;
  };
}

/**
 * 기본값.
 * - 길이 15~45초: docs/02 §4 의 가정 [미검증 — 첫 편 뒤 조정].
 * - 읽기 속도 14자/초(라틴 글자 기준)와 장면 3~6초: 짧은 영어 문장을 소리 없이 읽는 속도 가정 [미검증].
 * - 안전영역 상 270(14%) · 하 380(약 20%) · 좌우 64(6%): Instagram 릴스·YouTube Shorts 의 상단 계정·하단 캡션·버튼 가림 영역을
 *   알려진 권고치로 가정한 값 [미검증 — 공식 문서는 Aside 로 열람해 확인해야 한다. 이번 작업에서는 열람하지 않았다].
 * - 무음 AAC 트랙: 오디오 스트림이 없는 파일을 이상하게 처리하는 업로드 경로 대비 + 나중에 음성·음악을 섞어도 규격이 같다 [미검증].
 */
export const DEFAULT_REEL_PRESET: ReelPreset = {
  canvas: { width: 1080, height: 1920, fps: 30 },
  cardSource: { width: 1080, height: 1350 },
  cardMinWidthRatio: 0.6,
  safeArea: { top: 270, bottom: 380, left: 64, right: 64 },
  totalSec: { min: 15, max: 45 },
  scene: { minSec: 3, maxSec: 6, baseSec: 1.2, charsPerSec: 14, stretchMaxSec: 8 },
  transition: "crossfade",
  subtitle: {
    // 서체는 브랜드 확정 전(미정)이라 실행기에 있는 범용 산세리프를 쓴다. 한글은 해당 서체를 설치한 뒤 coversHangul 을 켠다.
    fontName: "DejaVu Sans",
    fontSize: 48,
    maxLines: 3,
    padPx: 14,
    lineHeightEm: 1.25,
    gapPx: 28,
    latinWidthEm: 0.6,
    wideWidthEm: 1.0,
    burnIn: true,
    coversHangul: false,
  },
  background: { blurSigma: 6, dim: 0.18 },
  audio: { silentTrack: true, sampleRate: 48000, bitrateKbps: 128 },
};

/** 프리셋 값끼리 모순이 없는지 본다. 빈 배열이면 정상 */
export function reelPresetIssues(p: ReelPreset): string[] {
  const issues: string[] = [];
  const { canvas, safeArea: s, totalSec, scene, subtitle } = p;
  const sec = REEL_TRANSITION_SEC[p.transition];
  if (canvas.width * 16 !== canvas.height * 9) issues.push(`캔버스가 9:16 이 아니다: ${canvas.width}x${canvas.height}`);
  if (canvas.fps <= 0 || !Number.isInteger(canvas.fps)) issues.push("fps 는 양의 정수여야 한다");
  if (s.top < 0 || s.bottom < 0 || s.left < 0 || s.right < 0) issues.push("안전영역은 음수일 수 없다");
  if (s.left + s.right >= canvas.width || s.top + s.bottom >= canvas.height) issues.push("안전영역이 캔버스를 다 덮는다");
  if (totalSec.min <= 0 || totalSec.min > totalSec.max) issues.push(`전체 길이 한도가 이상하다: ${totalSec.min}~${totalSec.max}`);
  if (scene.minSec <= 0 || scene.minSec > scene.maxSec || scene.maxSec > scene.stretchMaxSec) issues.push("장면 길이 한도는 min ≤ max ≤ stretchMax 여야 한다");
  if (scene.charsPerSec <= 0) issues.push("charsPerSec 는 양수여야 한다");
  if (scene.minSec < sec * 2 + 1) issues.push(`장면 최소 길이(${scene.minSec}s)는 전환 2번(${sec * 2}s) + 자막 노출 1초보다 길어야 한다`);
  if (subtitle.maxLines < 1 || subtitle.fontSize <= 0) issues.push("자막 줄 수·크기가 이상하다");
  if (p.cardSource.width * 5 !== p.cardSource.height * 4) issues.push("입력 카드가 4:5 가 아니다");
  return issues;
}
