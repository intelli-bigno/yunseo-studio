// 대시보드 디자인 시스템 「Private Ledger」 토큰 — 근거는 docs/design/final-direction.md.
// 원칙: 웜 차콜 바탕 + 크림 글자 + 황동 1색 강조. 상태는 색이 아니라 칩 모양(채움/윤곽)으로 구분한다(06 §5).

export const color = {
  // 바탕 — 따뜻한 차콜 4단(아래로 갈수록 떠 있다)
  bg: "#0F0F0E",
  sunken: "#0B0B0A",
  surface: "#161614",
  raised: "#1E1D1A",
  hover: "#24231F",
  // 선 — 카드 대신 선으로 구획한다
  line: "#2A2824",
  lineStrong: "#3E3B35",
  // 글자 — 크림 3단
  text: "#ECE6DA",
  textDim: "#ADA597",
  textMute: "#8A8378",
  // 강조 — 황동(brass). 오늘·선택·주 행동·포커스에만
  accent: "#C2A06A",
  accentHi: "#D9BD8A",
  accentDim: "#5E4E33",
  accentInk: "#17130C",
  // 경고 — 막힘 표시 글자에만(면 채움 금지)
  alert: "#D98A7A",
  // 종이 — 카드 미리보기 틀(밝은 카드 표지를 어두운 화면 안에서 대조)
  paper: "#EFE9DD",
  paperInk: "#1A1A18",
  paperLine: "#D6CEBF",
} as const;

export type ColorToken = keyof typeof color;

/** 서체 — 전부 SIL OFL 무료 서체(Google Fonts). 유료 서체 금지. */
export const font = {
  display: "Cormorant Garamond", // 큰 숫자·라틴 헤드라인
  serifKr: "Noto Serif KR", // 한글 헤드라인
  sans: "IBM Plex Sans KR", // UI 본문
  mono: "IBM Plex Mono", // 시각·수치·해시
} as const;

export const fontStack = {
  display: `var(--font-display), var(--font-serif-kr), "Times New Roman", serif`,
  serif: `var(--font-serif-kr), var(--font-display), serif`,
  sans: `var(--font-sans), -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`,
  mono: `var(--font-mono), ui-monospace, "SFMono-Regular", Menlo, monospace`,
} as const;

/** 글자 크기(px) — 컴팩트: UI 기본 13 */
export const fontSize = {
  micro: 10.5,
  xs: 11,
  sm: 12,
  base: 13,
  md: 14,
  lg: 16,
  xl: 20,
  h2: 26,
  h1: 34,
  display: 56,
  hero: 84,
} as const;

export const fontWeight = { regular: 400, medium: 500, semibold: 600 } as const;

export const letterSpacing = { caps: "0.14em", tight: "-0.01em", display: "-0.02em" } as const;

export const lineHeight = { tight: 1.1, snug: 1.3, base: 1.5 } as const;

/** 간격(px) — 4 기반, 밀도 높게 */
export const space = { 0: 0, 1: 2, 2: 4, 3: 6, 4: 8, 5: 12, 6: 16, 7: 20, 8: 24, 9: 32, 10: 48 } as const;

/** 모서리 — 거의 직각(가죽 다이어리·시계 다이얼의 단정한 선) */
export const radius = { none: 0, xs: 2, sm: 3, md: 4, pill: 999 } as const;

/** 레이아웃 치수(px) — 노트북(1280~1512) 기준 */
export const layout = {
  sidebar: 208,
  sidebarCollapsed: 56,
  topbar: 44,
  rail: 300,
  rowDense: 30,
  row: 34,
  contentMax: 1440,
  bpRail: 1180, // 이 폭 아래에서 오른쪽 레일이 본문 아래로
  bpSidebar: 960, // 이 폭 아래에서 사이드바가 아이콘 폭으로
} as const;

export const motion = { fast: "120ms", base: "180ms", ease: "cubic-bezier(.2,.7,.2,1)" } as const;

/** 컴포넌트 토큰 — 화면은 이 값만 쓴다 */
export const component = {
  chip: { height: 20, padX: 7, radius: radius.xs, fontSize: fontSize.xs },
  button: { height: 30, padX: 12, radius: radius.sm, fontSize: fontSize.sm },
  input: { height: 30, padX: 10, radius: radius.sm, fontSize: fontSize.base },
  kbd: { height: 18, padX: 5, radius: radius.xs, fontSize: fontSize.micro },
  table: { row: layout.row, headFontSize: fontSize.micro },
  focus: { width: 1, offset: 2 },
} as const;

/** 글자/바탕 쌍 — 테스트가 대비를 검사한다(본문 4.5 이상, 큰 글자·강조 3 이상) */
export const contrastPairs = [
  { fg: "text", bg: "bg", min: 4.5 },
  { fg: "text", bg: "raised", min: 4.5 },
  { fg: "textDim", bg: "bg", min: 4.5 },
  { fg: "textDim", bg: "surface", min: 4.5 },
  { fg: "textMute", bg: "bg", min: 4.5 },
  { fg: "textMute", bg: "surface", min: 4.5 },
  { fg: "accent", bg: "bg", min: 4.5 },
  { fg: "accent", bg: "surface", min: 4.5 },
  { fg: "alert", bg: "surface", min: 4.5 },
  { fg: "accentInk", bg: "accent", min: 4.5 },
  { fg: "bg", bg: "text", min: 4.5 },
  { fg: "paperInk", bg: "paper", min: 4.5 },
] as const satisfies readonly { fg: ColorToken; bg: ColorToken; min: number }[];
