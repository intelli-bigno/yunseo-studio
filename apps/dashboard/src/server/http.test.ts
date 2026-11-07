// 쓰기 API 본문 읽기 — 상한(Content-Length·실제 스트림)·JSON·최상위 객체 검사
import { describe, expect, it } from "vitest";
import { readJsonObject } from "./http";

const req = (body: BodyInit | null, headers: Record<string, string> = {}) => new Request("http://x/api", { method: "POST", body, headers, ...(body instanceof ReadableStream ? { duplex: "half" } : {}) } as RequestInit);
const errorOf = async (r: Awaited<ReturnType<typeof readJsonObject>>) => (r.ok ? null : { status: r.response.status, ...((await r.response.json()) as { error: { code: string } }).error });

describe("readJsonObject", () => {
  it("상한 안의 JSON 객체는 값과 바이트 수를 돌려준다", async () => {
    const r = await readJsonObject(req('{"a":"한"}'), 100);
    expect(r).toEqual({ ok: true, value: { a: "한" }, bytes: 11 });
  });

  it("Content-Length 가 상한을 넘으면 읽지 않고 413", async () => {
    expect(await errorOf(await readJsonObject(req("{}", { "content-length": "5000" }), 100))).toMatchObject({ status: 413, code: "TOO_LARGE" });
  });

  it("길이 머리말 없이 흘려 보내도 실제 바이트가 상한을 넘는 순간 413", async () => {
    const chunk = new TextEncoder().encode(`"${"x".repeat(60)}`);
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        c.enqueue(chunk);
      },
    });
    expect(await errorOf(await readJsonObject(req(stream), 100))).toMatchObject({ status: 413, code: "TOO_LARGE" });
  });

  it("JSON 이 아니면 400 BAD_JSON, 최상위가 객체가 아니면 400 NOT_OBJECT", async () => {
    expect(await errorOf(await readJsonObject(req("{nope"), 100))).toMatchObject({ status: 400, code: "BAD_JSON" });
    for (const b of ["null", "[]", "3", '"s"']) expect(await errorOf(await readJsonObject(req(b), 100))).toMatchObject({ status: 400, code: "NOT_OBJECT" });
  });

  it("빈 본문은 emptyAs 가 있으면 그 값, 없으면 400 — badCode 로 코드를 통일할 수 있다", async () => {
    expect(await readJsonObject(req(null), 100, { emptyAs: {} })).toEqual({ ok: true, value: {}, bytes: 0 });
    expect(await errorOf(await readJsonObject(req(""), 100))).toMatchObject({ status: 400, code: "BAD_JSON" });
    expect(await errorOf(await readJsonObject(req("[]"), 100, { badCode: "BAD_REQUEST" }))).toMatchObject({ status: 400, code: "BAD_REQUEST" });
  });
});
