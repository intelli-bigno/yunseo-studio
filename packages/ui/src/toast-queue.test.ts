import { describe, expect, it } from "vitest";
import { MAX_TOASTS, dismissToast, pushToast, toastMs, type ToastItem } from "./toast-queue";

const t = (id: number, text: string, tone: ToastItem["tone"] = "alert"): ToastItem => ({ id, text, tone, ms: 1 });

describe("토스트 목록", () => {
  it("새 것은 맨 아래에 쌓이고, 최대 개수를 넘으면 오래된 것부터 빠진다", () => {
    let list: ToastItem[] = [];
    for (let i = 1; i <= MAX_TOASTS + 2; i++) list = pushToast(list, t(i, `오류 ${i}`));
    expect(list.map((x) => x.id)).toEqual([3, 4, 5]);
  });

  it("같은 글·같은 종류는 쌓지 않고 새 것으로 바꾼다 — 연타해도 한 줄", () => {
    const list = pushToast(pushToast([], t(1, "저장하지 못했습니다")), t(2, "저장하지 못했습니다"));
    expect(list.map((x) => x.id)).toEqual([2]);
    // 종류가 다르면 별개
    expect(pushToast(list, t(3, "저장하지 못했습니다", "accent"))).toHaveLength(2);
  });

  it("닫으면 그 id 만 빠진다", () => {
    expect(dismissToast([t(1, "a"), t(2, "b")], 1).map((x) => x.id)).toEqual([2]);
  });

  it("사라지는 시간 — 동작 버튼이 있으면 가장 길고, 오류가 안내보다 길다", () => {
    expect(toastMs("alert", true)).toBeGreaterThan(toastMs("alert", false));
    expect(toastMs("alert", false)).toBeGreaterThan(toastMs("accent", false));
  });
});
