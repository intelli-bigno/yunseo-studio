// 브라우저 API 호출 한 겹 — 오류 모양 해석·재시도 규칙·취소
import { describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch, detailList, failureText, isRetryable, parseErrorBody } from "./api-client";

const json = (status: number, body: unknown) => new Response(body === null ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const seq = (...items: (Response | Error)[]) => {
  const fn = vi.fn(async () => {
    const next = items.shift();
    if (!next) throw new Error("응답이 모자란다");
    if (next instanceof Error) throw next;
    return next;
  });
  return fn as unknown as typeof fetch & typeof fn;
};
const sleep = vi.fn(async () => undefined);

describe("parseErrorBody", () => {
  it("새 모양({error:{code,message}}) · 옛 모양({error:문장}) · 본문 없음을 모두 읽는다", () => {
    expect(parseErrorBody(409, { error: { code: "REVISION_CONFLICT", message: "먼저 저장됨", details: { revision: 4 } } })).toMatchObject({ code: "REVISION_CONFLICT", message: "먼저 저장됨", status: 409, details: { revision: 4 } });
    expect(parseErrorBody(404, { error: "없다" })).toMatchObject({ code: "ERROR", message: "없다", status: 404 });
    expect(parseErrorBody(502, null)).toMatchObject({ code: "SERVER_ERROR", message: "응답 502" });
    expect(parseErrorBody(400, { 엉뚱: 1 })).toMatchObject({ code: "BAD_RESPONSE" });
  });
});

describe("apiFetch", () => {
  it("성공은 JSON, 204 는 null", async () => {
    expect(await apiFetch("/api/x", { fetchImpl: seq(json(200, { a: 1 })) })).toEqual({ a: 1 });
    expect(await apiFetch("/api/x", { method: "DELETE", fetchImpl: seq(new Response(null, { status: 204 })) })).toBeNull();
  });

  it("오류 응답은 ApiError(코드·메시지·상태) — 400 은 다시 보내지 않는다", async () => {
    const f = seq(json(400, { error: { code: "INVALID_DECK", message: "덱이 규칙에 어긋난다", details: { errors: ["a", "b"] } } }));
    const e = await apiFetch("/api/x", { fetchImpl: f, sleep }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({ code: "INVALID_DECK", status: 400, retryable: false });
    expect(detailList(e as ApiError, "errors")).toEqual(["a", "b"]);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("GET 은 연결 실패·503 을 짧게 다시 시도하다 성공하면 값을 돌려준다", async () => {
    const f = seq(new TypeError("fetch failed"), json(503, { error: { code: "UNAVAILABLE", message: "잠깐" } }), json(200, { ok: true }));
    expect(await apiFetch("/api/x", { fetchImpl: f, sleep })).toEqual({ ok: true });
    expect(f).toHaveBeenCalledTimes(3);
  });

  it("재시도를 다 쓰면 마지막 오류를 던진다 — 연결 실패는 NETWORK(status 0)", async () => {
    const f = seq(new TypeError("a"), new TypeError("b"), new TypeError("c"));
    const e = (await apiFetch("/api/x", { fetchImpl: f, sleep }).catch((x: unknown) => x)) as ApiError;
    expect(e).toMatchObject({ code: "NETWORK", status: 0, retryable: true });
    expect(f).toHaveBeenCalledTimes(3);
  });

  it("쓰기(POST)는 자동으로 다시 보내지 않는다 — 중복 생성 방지, 대신 retryable 로 화면이 버튼을 보여 준다", async () => {
    const f = seq(json(503, { error: { code: "UNAVAILABLE", message: "잠깐" } }));
    const e = (await apiFetch("/api/x", { method: "POST", fetchImpl: f, sleep }).catch((x: unknown) => x)) as ApiError;
    expect(f).toHaveBeenCalledTimes(1);
    expect(isRetryable(e)).toBe(true);
  });

  it("500 은 같은 결과가 날 가능성이 커서 자동 재시도는 안 하지만, 사용자 재시도 대상(retryable)이다", async () => {
    const f = seq(json(500, { error: { code: "INTERNAL", message: "서버 안에서 오류가 났다" } }));
    const e = (await apiFetch("/api/x", { fetchImpl: f, sleep }).catch((x: unknown) => x)) as ApiError;
    expect(f).toHaveBeenCalledTimes(1);
    expect(e).toMatchObject({ code: "INTERNAL", retryable: true });
  });

  it("시간 초과는 TIMEOUT 으로 바꾸고 다시 시도하지 않는다", async () => {
    const f = seq(new DOMException("t", "TimeoutError"));
    const e = (await apiFetch("/api/x", { fetchImpl: f, sleep, timeoutMs: 5000 }).catch((x: unknown) => x)) as ApiError;
    expect(e).toMatchObject({ code: "TIMEOUT", status: 0 });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("사용자가 취소한 요청은 오류로 바꾸지 않고 AbortError 그대로", async () => {
    const f = seq(new DOMException("x", "AbortError"));
    const e = await apiFetch("/api/x", { fetchImpl: f, sleep }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(DOMException);
    expect((e as DOMException).name).toBe("AbortError");
  });
});

describe("failureText", () => {
  it("서버 메시지가 있으면 그대로, 연결 실패는 앞 문구에 이유를 붙이고, 모르는 값은 fallback", () => {
    expect(failureText(new ApiError("INVALID_DECK", "덱이 규칙에 어긋난다", 400), "저장 실패")).toBe("덱이 규칙에 어긋난다");
    expect(failureText(new ApiError("NETWORK", "연결을 확인", 0), "저장 실패")).toBe("저장 실패 — 연결을 확인");
    expect(failureText(new Error("?"), "저장 실패")).toBe("저장 실패");
  });
});
