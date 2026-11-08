// 오류 체계 — AppError 의 코드·상태·응답 모양, 그리고 이를 상속한 도메인 오류들
import { describe, expect, it } from "vitest";
import { CardOpError } from "./cards-editor";
import { AppError, ERROR_STATUS, describeFailure, errorMessage, isAppError, isRetryableStatus, statusOfCode, toAppError } from "./errors";
import { ReelsOpError, SrtParseError } from "./reel";
import { AuthoringRuleError } from "./story";

describe("AppError", () => {
  it("코드에서 HTTP 상태가 정해지고, 표에 없는 코드는 500, 명시하면 그 값", () => {
    expect(new AppError("NOT_FOUND", "없다").status).toBe(404);
    expect(new AppError("FFMPEG_TIMEOUT", "느리다").status).toBe(504);
    expect(new AppError("처음_보는_코드", "?").status).toBe(500);
    expect(new AppError("NOT_FOUND", "다르게", { status: 410 }).status).toBe(410);
    expect(statusOfCode("toString")).toBe(500); // Object.prototype 의 이름도 코드로 오해하지 않는다
  });

  it("응답 본문은 { error: { code, message } } — path·details 는 있을 때만", () => {
    expect(new AppError("BAD_REQUEST", "틀렸다").toEnvelope()).toEqual({ error: { code: "BAD_REQUEST", message: "틀렸다" } });
    expect(new AppError("INVALID", "문제", { path: "deck.cards[0]", details: { n: 1 } }).toBody()).toEqual({ code: "INVALID", message: "문제", path: "deck.cards[0]", details: { n: 1 } });
  });

  it("원인(cause)을 이어 두고, 이름은 클래스 이름이다", () => {
    const cause = new Error("원인");
    const e = new AppError("INTERNAL", "겉 메시지", { cause });
    expect(e.cause).toBe(cause);
    expect(e).toBeInstanceOf(Error);
    class Sub extends AppError {}
    expect(new Sub("X", "m").name).toBe("Sub");
  });

  it("상태 표의 코드는 모두 4xx·5xx 다", () => {
    for (const [code, status] of Object.entries(ERROR_STATUS)) expect(status, code).toBeGreaterThanOrEqual(400);
  });
});

describe("toAppError · describeFailure", () => {
  it("AppError 는 그대로, 그 밖은 INTERNAL 로 감싸고 메시지는 숨긴다(원인은 cause)", () => {
    const own = new AppError("CONFLICT", "충돌");
    expect(toAppError(own)).toBe(own);
    const wrapped = toAppError(new Error("DB 경로 /secret/x.db 열기 실패"));
    expect(wrapped).toMatchObject({ code: "INTERNAL", status: 500, message: "서버 안에서 오류가 났다" });
    expect((wrapped.cause as Error).message).toContain("/secret/x.db");
  });

  it("fallback 으로 코드·메시지 공개 여부를 정한다", () => {
    expect(toAppError("문자열 오류", { code: "RENDER_FAILED", exposeMessage: true })).toMatchObject({ code: "RENDER_FAILED", message: "문자열 오류", status: 500 });
  });

  it("기록용 한 줄은 AppError 면 [코드] 메시지, 아니면 메시지만", () => {
    expect(describeFailure(new AppError("JOB_TIMEOUT", "시간 제한 1초 초과"))).toBe("[JOB_TIMEOUT] 시간 제한 1초 초과");
    expect(describeFailure(new Error("평범"))).toBe("평범");
    expect(errorMessage(42)).toBe("42");
    expect(isAppError(new Error("x"))).toBe(false);
  });
});

describe("다시 시도할 만한 상태", () => {
  it("연결 실패(0)·시간 초과·429·5xx 만 true, 입력·충돌·없음은 false", () => {
    for (const s of [0, 408, 429, 500, 502, 503, 504]) expect(isRetryableStatus(s), String(s)).toBe(true);
    for (const s of [400, 401, 404, 409, 413, 422, 501]) expect(isRetryableStatus(s), String(s)).toBe(false);
  });
});

describe("도메인 오류는 AppError 를 잇는다", () => {
  it("릴스 op 오류 — 영역 표의 상태와 path·details 를 그대로", () => {
    const e = new ReelsOpError("CLIP_OVERLAP", "겹침", "clips[1]", { clipId: "c1" });
    expect(e).toBeInstanceOf(AppError);
    expect(e.status).toBe(422);
    expect(e.toBody()).toEqual({ code: "CLIP_OVERLAP", message: "겹침", path: "clips[1]", details: { clipId: "c1" } });
    expect(new ReelsOpError("REVISION_CONFLICT", "낡음").status).toBe(409);
  });

  it("카드 op 오류 — DECK_NOT_FOUND 404, TOO_LARGE 413", () => {
    expect(new CardOpError("DECK_NOT_FOUND", "없음").status).toBe(404);
    expect(new CardOpError("TOO_LARGE", "큼").toEnvelope()).toEqual({ error: { code: "TOO_LARGE", message: "큼" } });
  });

  it("작성 규칙 위반 — 422, 이유 목록은 issues 와 details 에", () => {
    const e = new AuthoringRuleError("guard_failed", ["확인자 이름 필요", "근거 없음"]);
    expect(e).toMatchObject({ code: "guard_failed", status: 422, message: "확인자 이름 필요 · 근거 없음", issues: ["확인자 이름 필요", "근거 없음"] });
    expect(e.details).toEqual({ issues: ["확인자 이름 필요", "근거 없음"] });
  });

  it("SRT 읽기 실패 — 422 SRT_PARSE_ERROR, 줄 번호를 path 로", () => {
    const e = new SrtParseError("시각 모양이 틀렸다", 7);
    expect(e).toMatchObject({ code: "SRT_PARSE_ERROR", status: 422, line: 7, path: "line 7" });
  });
});
