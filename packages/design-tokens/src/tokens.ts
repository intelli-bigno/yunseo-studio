// 대시보드 디자인 시스템 「Ink & Brass」 토큰 — 2026-11-07 교체(「전부 녹색이라 색감 별로」 피드백). 근거: docs/design/palette/README.md
// 잉크 블랙 바탕 · 웜 아이보리 글자 · 황동 1색 강조 · 버건디는 막힘에만. 이 파일이 색의 유일한 기준(SoT)이다.
// 규격 원칙: 간격은 4/8 배수 한 줄 스케일, 글자는 6단계, 화면은 이 값(과 @yunseo/ui 컴포넌트)만 쓴다.

export const color = {
  // 바탕 — 잉크 블랙 4단(아래로 갈수록 떠 있다)
  bg: "#0E0F11",
  sunken: "#121316",
  surface: "#17181C",
  raised: "#1D1F24",
  hover: "#23262C",
  // 선
  line: "#262A30",
  lineStrong: "#333841",
  // 글자 — 웜 아이보리 3단
  text: "#EDE6D6",
  textDim: "#BDB6A8",
  textMute: "#948E82",
  // 강조 — 황동. 오늘·선택·주 행동·진행에만
  accent: "#C9A46A",
  accentHi: "#DDBE8A",
  accentDim: "#5A4A30",
  accentInk: "#121316",
  // 브랜드 면(크레스트·히어로 그라데이션) — 강조 없는 차콜
  brand: "#2A2C31",
  // 황동(옅은) — 아주 작은 표시(구분 기호·크레스트 글자)에만
  brass: "#B8925A",
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

/** 굵기는 400(본문)·600(강조) 두 단계뿐이다 — 한글 서체 파일이 굵기마다 약 100조각이라 단계를 늘리면 전송량이 그대로 는다. */
export type FontWeight = 400 | 600;

/**
 * 글자 6단계 — 이 밖의 크기·굵기는 쓰지 않는다.
 * label: 표 머리·배지·보조 / body: 본문·행 / title: 칸 제목·행 강조 / heading: 화면 제목 / metric: 핵심 숫자 / hero: 히어로 숫자
 */
export const type = {
  label: { size: 12, line: 16, weight: 600, family: "sans", tracking: "0.02em" },
  body: { size: 14, line: 24, weight: 400, family: "sans", tracking: "0" },
  title: { size: 18, line: 24, weight: 600, family: "sans", tracking: "-0.005em" },
  heading: { size: 28, line: 36, weight: 400, family: "head", tracking: "-0.01em" },
  metric: { size: 40, line: 40, weight: 400, family: "head", tracking: "-0.02em" },
  hero: { size: 64, line: 64, weight: 400, family: "head", tracking: "-0.02em" },
} as const satisfies Record<string, { size: number; line: number; weight: FontWeight; family: keyof typeof fontStack; tracking: string }>;

export type TypeStep = keyof typeof type;
export const typeSteps = Object.keys(type) as TypeStep[];

/** 간격(px) — 4/8 배수 한 줄 스케일. 여백·패딩·간격은 이 값만. */
export const space = { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32, 7: 48, 8: 64 } as const;
export type SpaceStep = keyof typeof space;

/** 모서리 — 4 배수, 작게(2026-11-05 「라운드 조금 줄이고」). pill 은 점·원형 버튼·진행 막대에만(라벨 캡슐 금지) */
export const radius = { none: 0, sm: 4, md: 8, lg: 12, pill: 999 } as const;

/** 정렬 그리드 — 12단, 홈 벤토는 단 수로만 나눈다 */
export const grid = { columns: 12, gutter: space[5], margin: space[6] } as const;

/** 레이아웃 치수(px) — 전부 8 배수 */
export const layout = {
  sidebar: 232,
  sidebarCollapsed: 72,
  topbar: 64,
  rail: 360,
  row: 48,
  tile: 216, // 레퍼런스 그리드 한 칸
  story: 360, // 9:16 플레이어 폭
  appIcon: 40,
} as const;

/** 반응형 경계(px) — CSS @media 는 변수를 못 써서 ui 스타일과 테스트가 같은 값을 쓴다 */
export const breakpoint = { rail: 1184, sidebar: 960, phone: 640 } as const;

/** 그림자 — 떠 있는 것(미리보기 카드·대화상자)에만 */
export const shadow = {
  card: "0 24px 48px -24px rgba(0, 0, 0, 0.55)",
  dialog: "0 32px 80px -24px rgba(0, 0, 0, 0.7)",
} as const;

/**
 * 모션 — 길이·이징·스태거·거리. 움직이는 속성은 transform·opacity 뿐(합성 단계만, 레이아웃을 다시 계산하지 않는다).
 * duration: fast 호버·눌림 / base 상태 변화 / slow 완료 표시 / scene 화면 전환 한 조각
 */
export const duration = { fast: 120, base: 200, slow: 320, scene: 420 } as const;
export const easing = {
  standard: "cubic-bezier(.2,.7,.2,1)",
  out: "cubic-bezier(.16,1,.3,1)", // 들어올 때 — 빠르게 와서 천천히 멈춘다
  in: "cubic-bezier(.55,0,.75,.2)", // 나갈 때 — 천천히 떠나 빠르게 사라진다
  spring: "cubic-bezier(.34,1.56,.64,1)", // 재조립 — 자리를 살짝 지나쳤다 돌아온다
} as const;

/**
 * 화면 전환 안무(분해 → 재조립). 이전 화면 조각은 누른 곳에서 바깥으로 흩어지고, 새 화면 조각은 반대쪽에서 모여든다.
 * stagger 는 누른 곳과의 거리 순서 한 칸당 지연, pieces 는 한 화면에서 따로 움직이는 조각 상한(넘으면 바탕과 함께 겹쳐 바뀐다).
 */
export const choreography = {
  pieces: 20,
  stagger: 12, // ms
  scatter: 40, // px — 흩어지는 최대 거리
  tilt: 3, // deg — 흩어질 때 기울기 상한
  shrink: 0.94, // 흩어진 조각의 크기 배율
  inDelay: 90, // ms — 새 조각이 출발하는 시점(이전 조각이 반쯤 흩어졌을 때)
  budget: 800, // ms — 전환 전체 상한(테스트가 지킨다)
} as const;

export const motion = {
  fast: `${duration.fast}ms`,
  base: `${duration.base}ms`,
  slow: `${duration.slow}ms`,
  scene: `${duration.scene}ms`,
  ease: easing.standard,
  easeOut: easing.out,
  easeIn: easing.in,
  spring: easing.spring,
  lift: "-2px", // 호버 때 떠오르는 높이
  press: "0.97", // 눌림 배율
} as const;

/** 컴포넌트 치수 — 전부 4 배수 */
export const component = {
  chip: { height: 24, padX: 0, radius: radius.none }, // 캡슐 없음 — 점+글자
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
