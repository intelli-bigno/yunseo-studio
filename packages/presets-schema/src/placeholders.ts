import { PLACEHOLDER } from "./types";

/** 값이 정확히 TBD 인 위치(경로)를 모두 찾는다. 하나라도 남으면 게시를 차단한다. */
export function findPlaceholders(value: unknown, path = "$"): string[] {
  if (value === PLACEHOLDER) return [path];
  if (Array.isArray(value)) return value.flatMap((v, i) => findPlaceholders(v, `${path}[${i}]`));
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([k, v]) => findPlaceholders(v, `${path}.${k}`));
  }
  return [];
}
