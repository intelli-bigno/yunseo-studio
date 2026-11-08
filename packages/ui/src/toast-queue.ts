// 토스트 목록 계산(순수 함수) — 화면 상태와 타이머는 toast.tsx 가 맡고, 쌓는 규칙만 여기서 테스트한다.
export type ToastTone = "alert" | "accent";

export interface ToastItem {
  id: number;
  text: string;
  tone: ToastTone;
  /** 「다시 시도」 같은 한 번 누르는 동작 */
  action?: { label: string; onAction: () => void };
  /** 자동으로 사라지기까지 */
  ms: number;
}

/** 한 번에 보이는 토스트 수 — 넘치면 오래된 것부터 치운다 */
export const MAX_TOASTS = 3;

/** 사라지기까지: 동작 버튼이 있으면 누를 시간을 더 준다, 오류는 읽을 시간을 더 준다 */
export const toastMs = (tone: ToastTone, hasAction: boolean): number => (hasAction ? 10_000 : tone === "alert" ? 7_000 : 4_000);

/** 새 토스트를 맨 아래에 더한다. 같은 글·같은 종류가 이미 있으면 쌓지 않고 그 자리를 새 것으로 바꾼다(연타해도 한 줄) */
export function pushToast(items: readonly ToastItem[], next: ToastItem): ToastItem[] {
  const rest = items.filter((t) => !(t.text === next.text && t.tone === next.tone));
  return [...rest, next].slice(-MAX_TOASTS);
}

export const dismissToast = (items: readonly ToastItem[], id: number): ToastItem[] => items.filter((t) => t.id !== id);
