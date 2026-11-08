// route() 래퍼 — 던진 오류가 { error: { code, message } } + 상태 + 로그로 바뀐다
import { AppError, ReelsOpError } from "@yunseo/domain";
import { afterEach, describe, expect, it, vi } from "vitest";
import { badRequest, errorResponse, jsonError, notFound, route } from "./api";

const req = (url = "http://x/api/things/1?secret=1", method = "POST") => new Request(url, { method });
const read = async (r: Response) => (await r.json()) as { error: { code: string; message: string; path?: string; details?: Record<string, unknown> } };

afterEach(() => vi.restoreAllMocks());

describe("route 래퍼", () => {
  it("정상 응답은 그대로 통과하고 인자(req, ctx)를 핸들러에 넘긴다", async () => {
    const handler = route(async (r: Request, ctx: { id: string }) => Response.json({ id: ctx.id, method: r.method }, { status: 201 }));
    const res = await handler(req(), { id: "d1" });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "d1", method: "POST" });
  });

  it("AppError 는 그 코드·상태·메시지로 답하고, 4xx 는 경로만 담은 warn 한 줄을 남긴다(쿼리·본문 없음)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const res = await route(() => {
      throw new AppError("REVISION_CONFLICT", "다른 곳에서 먼저 저장했다", { details: { revision: 7 } });
    })(req());
    expect(res.status).toBe(409);
    expect(await read(res)).toEqual({ error: { code: "REVISION_CONFLICT", message: "다른 곳에서 먼저 저장했다", details: { revision: 7 } } });
    expect(warn).toHaveBeenCalledTimes(1);
    const line = String(warn.mock.calls[0]?.[0]);
    expect(line).toContain("POST /api/things/1 409 REVISION_CONFLICT");
    expect(line).not.toContain("secret");
  });

  it("404 는 로그를 남기지 않는다(없는 그림을 계속 묻는 화면이 로그를 채우지 않게)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await route(() => {
      throw notFound("DECK_NOT_FOUND", "d1 없음");
    })(req(undefined, "GET"));
    expect(res.status).toBe(404);
    expect((await read(res)).error.code).toBe("DECK_NOT_FOUND");
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("알 수 없는 오류는 500 INTERNAL — 메시지는 숨기고 원인은 스택과 함께 error 로그에만", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await route(async () => {
      throw new Error("SQLITE_BUSY: /Volumes/secret/studio.db");
    })(req());
    expect(res.status).toBe(500);
    const body = await read(res);
    expect(body.error).toEqual({ code: "INTERNAL", message: "서버 안에서 오류가 났다" });
    expect(JSON.stringify(body)).not.toContain("SQLITE_BUSY");
    const logged = String(error.mock.calls[0]?.[0]);
    expect(logged).toContain("POST /api/things/1 500 INTERNAL");
    expect(logged).toContain("SQLITE_BUSY");
    expect(logged).toContain("at "); // 스택
  });

  it("Error 가 아닌 값을 던져도 500 으로 끝난다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await route(() => Promise.reject("그냥 문자열"))(req());
    expect(res.status).toBe(500);
    expect((await read(res)).error.code).toBe("INTERNAL");
  });

  it("영역 오류(ReelsOpError)는 자기 표의 상태로 나간다", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const res = await route(() => {
      throw new ReelsOpError("CLIP_OVERLAP", "겹침", "clips[1]");
    })(req());
    expect(res.status).toBe(422);
    expect(await read(res)).toEqual({ error: { code: "CLIP_OVERLAP", message: "겹침", path: "clips[1]" } });
  });
});

describe("jsonError · errorResponse · 헬퍼", () => {
  it("일찍 돌려주는 오류도 같은 모양 — 상태·헤더·path·details 를 싣는다", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const res = jsonError("RANGE_NOT_SATISFIABLE", "구간 밖", { status: 416, headers: { "content-range": "bytes */10" }, path: "range", details: { size: 10 } });
    expect(res.status).toBe(416);
    expect(res.headers.get("content-range")).toBe("bytes */10");
    expect(await read(res)).toEqual({ error: { code: "RANGE_NOT_SATISFIABLE", message: "구간 밖", path: "range", details: { size: 10 } } });
  });

  it("상태를 안 주면 코드 표에서 정한다", () => {
    expect(jsonError("TOO_LARGE", "큼").status).toBe(413);
    expect(errorResponse(new AppError("FFMPEG_UNAVAILABLE", "ffmpeg 없음")).status).toBe(503);
  });

  it("badRequest 는 400 BAD_REQUEST", async () => {
    const e = badRequest("title 은 문자열이어야 한다");
    expect(e).toMatchObject({ code: "BAD_REQUEST", status: 400 });
  });
});
