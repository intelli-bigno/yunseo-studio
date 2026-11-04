// 대시보드 디자인 시스템 「Club Green」 토큰 — 근거는 docs/design/directions-v2/ (안 B, 2026-11-04 사용자 결정).
// 딥그린 바탕 · 아이보리 글자 · 민트 1색 강조 · 버건디는 막힘에만.
// 규격 원칙: 간격은 4/8 배수 한 줄 스케일, 글자는 6단계, 화면은 이 값(과 @yunseo/ui 컴포넌트)만 쓴다.

export const color = {
  // 바탕 — 딥그린 4단(아래로 갈수록 떠 있다)
  bg: "#0A1612",
  sunken: "#0D1D18",
  surface: "#12261F",
  raised: "#183129",
  hover: "#1D3A30",
  // 선
  line: "#1F3A30",
  lineStrong: "#2A4A3E",
  // 글자 — 아이보리 3단
  text: "#F1EBDD",
  textDim: "#B4C2B8",
  textMute: "#8EA397",
  // 강조 — 민트. 오늘·선택·주 행동·진행에만
  accent: "#9FD3B4",
  accentHi: "#BDE4CC",
  accentDim: "#2F6B52",
  accentInk: "#0D1D18",
  // 클럽 그린 — 브랜드 면(크레스트·히어로 그라데이션)
  brand: "#1B3D31",
  // 황동 — 아주 작은 표시(구분 기호·크레스트 글자)에만
  brass: "#C8A56A",
  // 버건디 — 막힘 표시에만
  alert: "#E39AA4",
  alertBg: "#4A1A22",
  // 종이 — 카드 미리보기 틀
  paper: "#EFE9DD",
  paperInk: "#1A1A18",
  paperLine: "#D6CEBF",
} as const;

export type ColorToken = keyof typeof color;

/** 서체 — 무료만. 제목·숫자는 Optima(macOS 기본) → 없으면 본문 서체. 본문은 IBM Plex Sans KR(SIL OFL). */
export const font = {
  sans: "IBM Plex Sans KR",
  mono: "IBM Plex Mono",
} as const;

export const fontStack = {
  head: `"Optima", "Candara", var(--font-sans), -apple-system, "Apple SD Gothic Neo", sans-serif`,
  sans: `var(--font-sans), -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`,
  mono: `var(--font-mono), ui-monospace, "SFMono-Regular", Menlo, monospace`,
} as const;

/**
 * 글자 6단계 — 이 밖의 크기는 쓰지 않는다.
 * label: 표 머리·배지·보조 / body: 본문·행 / title: 칸 제목·행 강조 / heading: 화면 제목 / metric: 핵심 숫자 / hero: 히어로 숫자
 */
export const type = {
  label: { size: 12, line: 16, weight: 600, family: "sans", tracking: "0.02em" },
  body: { size: 14, line: 24, weight: 400, family: "sans", tracking: "0" },
  title: { size: 18, line: 24, weight: 600, family: "sans", tracking: "-0.005em" },
  heading: { size: 28, line: 36, weight: 500, family: "head", tracking: "-0.01em" },
  metric: { size: 40, line: 40, weight: 500, family: "head", tracking: "-0.02em" },
  hero: { size: 64, line: 64, weight: 500, family: "head", tracking: "-0.02em" },
} as const satisfies Record<string, { size: number; line: number; weight: number; family: keyof typeof fontStack; tracking: string }>;

export type TypeStep = keyof typeof type;
export const typeSteps = Object.keys(type) as TypeStep[];

/** 간격(px) — 4/8 배수 한 줄 스케일. 여백·패딩·간격은 이 값만. */
export const space = { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32, 7: 48, 8: 64 } as const;
export type SpaceStep = keyof typeof space;

/** 모서리 — 8 배수 */
export const radius = { none: 0, sm: 8, md: 16, lg: 24, pill: 999 } as const;

/** 정렬 그리드 — 12단, 홈 벤토는 단 수로만 나눈다 */
export const grid = { columns: 12, gutter: space[5], margin: space[6] } as const;

/** 레이아웃 치수(px) — 전부 8 배수 */
export const layout = {
  sidebar: 232,
  sidebarCollapsed: 72,
  topbar: 64,
  rail: 360,
  row: 48,
  contentMax: 1440,
} as const;

/** 반응형 경계(px) — CSS @media 는 변수를 못 써서 ui 스타일과 테스트가 같은 값을 쓴다 */
export const breakpoint = { rail: 1184, sidebar: 960 } as const;

/** 그림자 — 떠 있는 것(미리보기 카드·대화상자)에만 */
export const shadow = {
  card: "0 24px 48px -24px rgba(0, 0, 0, 0.55)",
  dialog: "0 32px 80px -24px rgba(0, 0, 0, 0.7)",
} as const;

export const motion = { fast: "120ms", base: "200ms", ease: "cubic-bezier(.2,.7,.2,1)" } as const;

/** 컴포넌트 치수 — 전부 4 배수 */
export const component = {
  chip: { height: 24, padX: 8, radius: radius.sm },
  button: { height: 40, padX: 16, radius: radius.sm },
  input: { height: 40, padX: 12, radius: radius.sm },
  kbd: { height: 20, padX: 4, radius: 4 },
  focus: { width: 2, offset: 2 },
} as const;

/** 글자/바탕 쌍 — 테스트가 대비를 검사한다(본문 4.5 이상) */
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
  { fg: "alert", bg: "alertBg", min: 4.5 },
  { fg: "accentInk", bg: "accent", min: 4.5 },
  { fg: "accentInk", bg: "text", min: 4.5 },
  { fg: "paperInk", bg: "paper", min: 4.5 },
] as const satisfies readonly { fg: ColorToken; bg: ColorToken; min: number }[];
