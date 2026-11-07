// 속성 시트 접힘 기억 — 이 브라우저의 localStorage 에만(서버로 가지 않는다). 저장소를 못 쓰면(차단·시크릿 창) 기본(펼침)으로 돌아가고 기억만 못 한다.
export const SHEET_KEY = "ys.cards.sheet";

type Reader = Pick<Storage, "getItem">;
type Writer = Pick<Storage, "setItem">;

/** 저장된 값이 "0"(접음)일 때만 접힌 채 시작한다 — 값이 없거나 읽기가 막혀도 펼침 */
export function loadSheetOpen(storage: Reader | null): boolean {
  try {
    return storage?.getItem(SHEET_KEY) !== "0";
  } catch {
    return true;
  }
}

export function saveSheetOpen(storage: Writer | null, open: boolean): void {
  try {
    storage?.setItem(SHEET_KEY, open ? "1" : "0");
  } catch {
    /* 기억만 못 할 뿐 */
  }
}

/** 브라우저 저장소 — 접근 자체가 던지는 환경이면 null */
export function browserStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}
