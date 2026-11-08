// 유스케이스·어댑터의 실패 값 → API 가 던질 오류
import { AppError, ReelsOpError } from "@yunseo/domain";
import { describe, expect, it } from "vitest";
import { deckSaveFailure, invalidProject, opsFailure, renderFailure } from "./failures";

describe("덱 저장 실패", () => {
  it("400 은 검증 문제 목록을 details.errors 에, 메시지엔 앞 3개만", () => {
    const e = deckSaveFailure({ ok: false, status: 400, errors: ["a", "b", "c", "d"] });
    expect(e).toMatchObject({ code: "INVALID_DECK", status: 400, message: "덱이 규칙에 어긋난다 — a, b, c" });
    expect(e.details).toEqual({ errors: ["a", "b", "c", "d"] });
  });

  it("404 는 DECK_NOT_FOUND, 409 는 REVISION_CONFLICT(현재 revision 을 details 로)", () => {
    expect(deckSaveFailure({ ok: false, status: 404 })).toMatchObject({ code: "DECK_NOT_FOUND", status: 404 });
    const conflict = deckSaveFailure({ ok: false, status: 409, revision: 8 });
    expect(conflict).toMatchObject({ code: "REVISION_CONFLICT", status: 409 });
    expect(conflict.details).toEqual({ revision: 8 });
    expect(deckSaveFailure({ ok: false, status: 409 }).details).toBeUndefined();
  });
});

describe("내보내기(ffmpeg) 실패", () => {
  it("타입 있는 오류는 코드를 그대로 둔다", () => {
    const own = new AppError("FFMPEG_TIMEOUT", "ffmpeg 가 시간 안에 끝나지 않았다");
    expect(renderFailure(own)).toBe(own);
  });

  it("그 밖은 RENDER_FAILED(500) — 메시지는 그대로 보여 주고 원인을 잇는다", () => {
    const cause = new Error("Invalid data found when processing input");
    const e = renderFailure(cause);
    expect(e).toMatchObject({ code: "RENDER_FAILED", status: 500, message: "Invalid data found when processing input" });
    expect(e.cause).toBe(cause);
  });
});

describe("프로젝트·ops 실패", () => {
  it("모양 문제는 400 INVALID_PROJECT + details.problems", () => {
    expect(invalidProject(["title 이 비었다"])).toMatchObject({ code: "INVALID_PROJECT", status: 400, details: { problems: ["title 이 비었다"] } });
  });

  it("ops 유스케이스의 실패 응답은 코드·상태를 이어 받고 최신 revision 을 details 에 싣는다", () => {
    const failure = new ReelsOpError("REVISION_CONFLICT", "revision 3 이 낡았다(현재 5)");
    const e = opsFailure({ status: 409, body: { error: failure.toBody(), revision: 5 } });
    expect(e).toMatchObject({ code: "REVISION_CONFLICT", status: 409, message: "revision 3 이 낡았다(현재 5)" });
    expect(e.details).toEqual({ revision: 5 });
  });

  it("오류 본문이 없어도 코드·메시지를 채운다", () => {
    expect(opsFailure({ status: 500, body: {} })).toMatchObject({ code: "SAVE_FAILED", status: 500, message: "저장하지 못했다" });
  });
});
