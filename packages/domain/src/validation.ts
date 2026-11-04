// 외부 의존 없는 최소 검증 도구. 콘텐츠 정본·프리셋 스키마가 함께 쓴다.

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

export type Json = Record<string, unknown>;

export function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 오류를 경로와 함께 모으는 수집기. */
export class Issues {
  readonly errors: string[] = [];

  add(path: string, message: string): void {
    this.errors.push(`${path}: ${message}`);
  }

  get ok(): boolean {
    return this.errors.length === 0;
  }

  result<T>(value: T): ValidationResult<T> {
    return this.ok ? { ok: true, value } : { ok: false, errors: this.errors };
  }

  record(value: unknown, path: string): Json {
    if (isRecord(value)) return value;
    this.add(path, "객체여야 한다");
    return {};
  }

  /** 비어 있지 않은 문자열. */
  text(value: unknown, path: string): string {
    if (typeof value === "string" && value.trim() !== "") return value;
    this.add(path, "비어 있지 않은 문자열이어야 한다");
    return "";
  }

  /** 문자열 또는 null (자리표시자를 null 로 두는 필드). */
  textOrNull(value: unknown, path: string): string | null {
    if (value === null) return null;
    return this.text(value, path);
  }

  oneOf<T extends string>(value: unknown, allowed: readonly T[], path: string, fallback: T): T {
    if (typeof value === "string" && (allowed as readonly string[]).includes(value)) return value as T;
    this.add(path, `${allowed.join(" | ")} 중 하나여야 한다`);
    return fallback;
  }

  array(value: unknown, path: string, min = 0): unknown[] {
    if (!Array.isArray(value)) {
      this.add(path, "배열이어야 한다");
      return [];
    }
    if (value.length < min) this.add(path, `항목이 ${min}개 이상이어야 한다`);
    return value;
  }

  textArray(value: unknown, path: string, min = 0): string[] {
    return this.array(value, path, min).map((v, i) => this.text(v, `${path}[${i}]`));
  }
}
