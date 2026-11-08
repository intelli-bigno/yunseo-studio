// 문장 표시(사실·시장·견해·시나리오) — strings.ts 와 plan/types.ts 가 함께 쓴다(둘 사이 순환을 끊으려고 따로 둔다, 2026-11-08).
export type Marker = "fact" | "market" | "view" | "scenario";
