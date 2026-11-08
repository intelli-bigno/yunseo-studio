// 오류를 한 체계로 — 코드(code)·사람이 읽는 메시지(message)·HTTP 상태(status)를 가진 타입 있는 오류.
// 도메인·유스케이스·어댑터의 오류는 모두 AppError 를 상속하고, API 래퍼(dashboard server/api.ts)·워커 스케줄러·화면이 같은 모양으로 읽는다.
// 응답 모양: { error: { code, message, path?, details? } } — code 는 기계가 가르는 값, message 는 사람이 읽는 한 덩어리다.

/** 공통 코드와 기본 HTTP 상태. 영역별 코드(예: CLIP_OVERLAP)는 각자 표를 갖고 AppError 생성자에 status 를 넘긴다. */
export const ERROR_STATUS = {
  BAD_REQUEST: 400,
  BAD_JSON: 400,
  NOT_OBJECT: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  REVISION_CONFLICT: 409,
  TOO_LARGE: 413,
  RANGE_NOT_SATISFIABLE: 416,
  UNPROCESSABLE: 422,
  INTERNAL: 500,
  RENDER_FAILED: 500,
  UPSTREAM_FAILED: 502,
  UNAVAILABLE: 503,
  TIMEOUT: 504,
  // 외부 프로세스 — ffmpeg·초안 명령(codex 등)
  FFMPEG_UNAVAILABLE: 503,
  FFMPEG_FAILED: 500,
  FFMPEG_TIMEOUT: 504,
  DRAFTER_DISABLED: 503,
  DRAFTER_FAILED: 502,
  DRAFTER_TIMEOUT: 504,
  DRAFTER_BAD_OUTPUT: 502,
  // 설정
  CONFIG_INVALID: 500,
  CONFIG_MISSING: 500,
  // 워커 작업
  JOB_TIMEOUT: 504,
  JOB_ABORTED: 503,
  JOB_NOT_FOUND: 404,
} as const;

export type CommonErrorCode = keyof typeof ERROR_STATUS;

export interface ErrorBody {
  code: string;
  message: string;
  /** 오류가 난 자리(JSON 경로 등) */
  path?: string;
  details?: Record<string, unknown>;
}

/** 응답 본문 — 모든 API 오류가 이 모양이다 */
export interface ErrorEnvelope {
  error: ErrorBody;
}

export interface AppErrorOptions {
  /** 생략하면 ERROR_STATUS[code], 표에 없으면 500 */
  status?: number;
  path?: string | undefined;
  details?: Record<string, unknown> | undefined;
  cause?: unknown;
}

export class AppError<C extends string = string> extends Error {
  readonly code: C;
  readonly status: number;
  readonly path: string | undefined;
  readonly details: Record<string, unknown> | undefined;

  constructor(code: C, message: string, options: AppErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = new.target.name;
    this.code = code;
    this.status = options.status ?? statusOfCode(code);
    this.path = options.path;
    this.details = options.details;
  }

  toBody(): ErrorBody {
    return { code: this.code, message: this.message, ...(this.path ? { path: this.path } : {}), ...(this.details ? { details: this.details } : {}) };
  }

  toEnvelope(): ErrorEnvelope {
    return { error: this.toBody() };
  }
}

export const isAppError = (e: unknown): e is AppError => e instanceof AppError;

export function statusOfCode(code: string): number {
  return Object.hasOwn(ERROR_STATUS, code) ? ERROR_STATUS[code as CommonErrorCode] : 500;
}

/** 던져진 값에서 사람이 읽는 메시지 — Error 가 아니어도 문자열로 */
export const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * 어떤 값이든 AppError 로 — 이미 AppError 면 그대로, 아니면 fallback 코드로 감싼다(원인은 cause 에 둔다).
 * 알 수 없는 오류(INTERNAL)의 메시지는 바깥에 내보내지 않는 쪽이 안전하므로 호출하는 쪽이 exposeMessage 로 정한다.
 */
export function toAppError(e: unknown, fallback: { code?: string; message?: string; exposeMessage?: boolean } = {}): AppError {
  if (e instanceof AppError) return e;
  const code = fallback.code ?? "INTERNAL";
  const message = fallback.exposeMessage ? errorMessage(e) : (fallback.message ?? "서버 안에서 오류가 났다");
  return new AppError(code, message, { cause: e });
}

/** 다시 시도하면 될 수 있는 오류인가 — 서버·연결 쪽 문제(5xx·시간 초과)만. 입력·규칙·충돌 오류는 다시 보내도 같다 */
export const isRetryableStatus = (status: number): boolean => status === 0 || status === 408 || status === 429 || (status >= 500 && status !== 501);

/** 로그·기록용 한 줄 — `[CODE] 메시지` (AppError 가 아니면 메시지만) */
export const describeFailure = (e: unknown): string => (e instanceof AppError ? `[${e.code}] ${e.message}` : errorMessage(e));
