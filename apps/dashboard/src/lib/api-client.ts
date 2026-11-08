// 브라우저에서 /api 를 부르는 한 겹 — 서버의 오류 모양 { error: { code, message } } 을 ApiError 로 읽고, 연결·시간 초과도 같은 타입으로 돌려준다.
//  · GET·HEAD 는 연결 실패·502/503/504 일 때 짧게 두어 번 다시 시도한다(쓰기는 중복 위험이 있어 자동으로 다시 보내지 않는다 — 화면이 「다시 시도」 를 보여 준다).
//  · 사용자가 취소(AbortError)한 것은 오류로 바꾸지 않고 그대로 던진다.
import { isRetryableStatus } from "@yunseo/domain";

export class ApiError extends Error {
  override name = "ApiError";
  constructor(
    readonly code: string,
    message: string,
    /** HTTP 상태. 연결 실패·시간 초과는 0 */
    readonly status: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
  /** 다시 보내면 될 수 있는 오류인가(연결·서버 쪽). 입력·충돌 오류는 false */
  get retryable(): boolean {
    return isRetryableStatus(this.status);
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** 응답 본문 → 오류. 새 모양({error:{code,message}})과 옛 모양({error:"문장"})·본문 없음을 모두 받아 낸다 */
export function parseErrorBody(status: number, body: unknown): ApiError {
  const e = isRecord(body) ? body.error : undefined;
  if (isRecord(e) && typeof e.message === "string") {
    return new ApiError(typeof e.code === "string" ? e.code : "ERROR", e.message, status, isRecord(e.details) ? e.details : undefined);
  }
  if (typeof e === "string") return new ApiError("ERROR", e, status);
  return new ApiError(status >= 500 ? "SERVER_ERROR" : "BAD_RESPONSE", `응답 ${status}`, status);
}

export const networkError = (): ApiError => new ApiError("NETWORK", "연결을 확인", 0);
export const timeoutError = (ms: number): ApiError => new ApiError("TIMEOUT", `${Math.round(ms / 1000)}초 안에 답이 없다`, 0);

const isAbort = (e: unknown): boolean => typeof e === "object" && e !== null && (e as { name?: unknown }).name === "AbortError";
const isTimeout = (e: unknown): boolean => typeof e === "object" && e !== null && (e as { name?: unknown }).name === "TimeoutError";

export interface ApiFetchOptions extends RequestInit {
  /** 이 시간 안에 답이 없으면 TIMEOUT. 기본 30초 */
  timeoutMs?: number;
  /** 자동 재시도 횟수 — GET·HEAD 만. 기본 2 */
  retries?: number;
  /** 테스트용 */
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

/** 다시 시도 사이 대기 — 사용자가 취소하면 타이머를 거두고 바로 깨어난다(다음 fetch 가 취소 오류를 던진다) */
const sleepMs = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const wake = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", wake);
      resolve();
    };
    const timer = setTimeout(wake, ms);
    signal?.addEventListener("abort", wake, { once: true });
  });

/** JSON 을 돌려주는 API 호출. 실패는 ApiError, 사용자 취소는 AbortError 그대로 */
export async function apiFetch<T = unknown>(url: string, options: ApiFetchOptions = {}): Promise<T> {
  const { timeoutMs = 30_000, retries = 2, fetchImpl, signal, sleep = (ms: number) => sleepMs(ms, signal ?? undefined), ...init } = options;
  const doFetch = fetchImpl ?? ((u: string, i?: RequestInit) => fetch(u, i));
  const method = (init.method ?? "GET").toUpperCase();
  const attempts = method === "GET" || method === "HEAD" ? retries + 1 : 1;
  let last: ApiError = networkError();
  for (let n = 1; n <= attempts; n++) {
    const timeout = AbortSignal.timeout(timeoutMs);
    try {
      const res = await doFetch(url, { ...init, signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
      if (res.ok) return (res.status === 204 ? null : await res.json().catch(() => null)) as T;
      last = parseErrorBody(res.status, await res.json().catch(() => null));
    } catch (e) {
      if (isAbort(e) && !timeout.aborted) throw e; // 사용자 취소
      last = isTimeout(e) || timeout.aborted ? timeoutError(timeoutMs) : networkError();
    }
    // 입력·충돌 오류는 다시 보내도 같다 — 연결·서버 쪽 오류만 다시 시도한다
    if (!last.retryable || last.status === 500 || last.code === "TIMEOUT" || n === attempts) break;
    await sleep(300 * n);
  }
  throw last;
}

/** 화면에 띄울 한 줄 — 서버 메시지가 있으면 그대로, 없으면 fallback */
export function failureText(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.status === 0 ? `${fallback} — ${e.message}` : e.message || fallback;
  return fallback;
}

/** 오류 details 의 문자열 배열(예: 덱 검증 문제 목록 details.errors) — 없으면 빈 배열 */
export function detailList(e: ApiError | null | undefined, key: string): string[] {
  const v = e?.details?.[key];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/** 다시 시도 버튼을 보여 줄 오류인가 — 서버 오류 응답(5xx)·연결 실패·시간 초과만 */
export const isRetryable = (e: unknown): boolean => e instanceof ApiError && e.retryable;
