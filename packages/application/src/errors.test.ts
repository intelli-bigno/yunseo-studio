// 유스케이스 계층 오류도 AppError — 코드·상태가 응답·화면 안내로 그대로 이어진다
import { AppError } from "@yunseo/domain";
import { describe, expect, it } from "vitest";
import { PieceNotFoundError, PipelineStepError, RevisionConflictError } from "./authoring";

describe("유스케이스 오류", () => {
  it("편 없음 — 404 PIECE_NOT_FOUND", () => {
    const e = new PieceNotFoundError("P-1");
    expect(e).toBeInstanceOf(AppError);
    expect(e).toMatchObject({ code: "PIECE_NOT_FOUND", status: 404, pieceId: "P-1", message: "편 P-1 없음" });
  });

  it("버전 충돌 — 409 REVISION_CONFLICT, 읽은 버전·지금 버전을 details 에", () => {
    const e = new RevisionConflictError("P-1", 3, 5);
    expect(e).toMatchObject({ code: "REVISION_CONFLICT", status: 409, expected: 3, actual: 5 });
    expect(e.toEnvelope().error.details).toEqual({ pieceId: "P-1", expected: 3, actual: 5 });
  });

  it("파이프라인 단계 막힘 — 409, 이유가 메시지이고 단계는 details 에", () => {
    const e = new PipelineStepError("render", "렌더러가 없다");
    expect(e).toMatchObject({ code: "PIPELINE_STEP_BLOCKED", status: 409, message: "렌더러가 없다", step: "render", reason: "렌더러가 없다" });
    expect(e.details).toEqual({ step: "render" });
  });
});
