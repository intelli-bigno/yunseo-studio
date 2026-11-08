// API 라우트 공통 래퍼 — /api 의 모든 route.ts 는 `export const GET = route(async (req, ctx) => …)` 모양으로 쓴다(tests/api-routes.test.ts 가 강제).
//  · 오류 응답은 항상 { error: { code, message } } + 알맞은 HTTP 상태. 라우트는 던지면 된다(AppError → 그 코드·상태, 그 밖 → 500 INTERNAL).
//  · 알 수 없는 오류의 메시지는 바깥에 내보내지 않는다(「서버 안에서 오류가 났다」) — 원인은 로그에만 남는다.
//  · 로그: 5xx 는 error(스택·원인 포함), 404 를 뺀 4xx 는 warn 한 줄. 본문·쿼리는 싣지 않는다(경로만).
import { AppError, errorMessage, toAppError } from "@yunseo/domain";

export interface JsonErrorOptions {
  status?: number;
  path?: string;
  details?: Record<string, unknown>;
  headers?: HeadersInit;
}

/** 오류 응답 하나 — 라우트가 일찍 돌려줄 때(던지지 않고)도 이 모양을 쓴다 */
export function jsonError(code: string, message: string, options: JsonErrorOptions = {}): Response {
  return errorResponse(new AppError(code, message, { ...(options.status !== undefined ? { status: options.status } : {}), path: options.path, details: options.details }), undefined, options.headers);
}

/** 던져진 값 → 응답. req 를 주면 로그에 메서드·경로가 붙는다 */
export function errorResponse(e: unknown, req?: Pick<Request, "method" | "url">, headers?: HeadersInit): Response {
  const err = toAppError(e);
  logFailure(err, req);
  return Response.json(err.toEnvelope(), { status: err.status, ...(headers ? { headers } : {}) });
}

/** 404 로 던질 오류 — `throw notFound("DECK_NOT_FOUND", "…")` */
export const notFound = (code = "NOT_FOUND", message = "찾을 수 없다") => new AppError(code, message, { status: 404 });

/** 400 으로 던질 오류 — 요청 모양이 틀렸을 때 */
export const badRequest = (message: string, details?: Record<string, unknown>) => new AppError("BAD_REQUEST", message, { status: 400, details });

function logFailure(err: AppError, req?: Pick<Request, "method" | "url">): void {
  if (err.status === 404) return;
  const where = req ? ` ${req.method} ${safePath(req.url)}` : "";
  const head = `[api]${where} ${err.status} ${err.code}: ${err.message.split("\n")[0]}`;
  if (err.status < 500) {
    console.warn(head);
    return;
  }
  // 5xx — 원인(알 수 없는 오류면 던져진 값 자체)과 스택을 남긴다
  const root = err.cause ?? err;
  const stack = root instanceof Error ? root.stack : undefined;
  console.error(`${head}${err.cause !== undefined ? ` ← ${errorMessage(err.cause)}` : ""}${stack ? `\n${stack}` : ""}`);
}

const safePath = (url: string): string => {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
};

/**
 * 라우트 핸들러를 감싼다 — 던져진 오류를 위 모양의 응답으로 바꾼다. 인자(req, ctx…)는 그대로 넘기고 반환 타입만 Promise<Response> 로 맞춘다.
 * Next 의 라우트 시그니처 검사가 보는 첫 인자(Request)와 둘째 인자(ctx)의 타입이 핸들러 그대로 남는다.
 */
export function route<A extends unknown[]>(handler: (req: Request, ...rest: A) => Response | Promise<Response>): (req: Request, ...rest: A) => Promise<Response> {
  return async (req, ...rest) => {
    try {
      return await handler(req, ...rest);
    } catch (e) {
      return errorResponse(e, req);
    }
  };
}
