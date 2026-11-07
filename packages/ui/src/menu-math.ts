// 메뉴 방향키 이동 — 눌린 키가 가리키는 다음 칸(처음·끝에서 돌아 이어진다). 해당 없는 키·빈 메뉴는 null.
export function menuStep(current: number, count: number, key: string): number | null {
  if (count <= 0) return null;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if (key === "ArrowDown") return current < 0 ? 0 : (current + 1) % count;
  if (key === "ArrowUp") return current < 0 ? count - 1 : (current - 1 + count) % count;
  return null;
}
