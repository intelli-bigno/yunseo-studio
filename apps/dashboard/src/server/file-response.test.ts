// 파일 응답 — 본문은 스트림(구간 요청이면 그 구간만), ETag 로 다시 물으면 304, 헤더 정책
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { fileResponse } from "./library";

const dir = mkdtempSync(join(tmpdir(), "ys-file-response-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const body = Buffer.from(Array.from({ length: 5000 }, (_, i) => i % 251));
const file = join(dir, "a.mp4");
writeFileSync(file, body);
const req = (headers: Record<string, string> = {}) => new Request("http://x/f", { headers });
const bytes = async (r: Response) => Buffer.from(await r.arrayBuffer());

describe("fileResponse", () => {
  it("전체: 200 · 크기·종류·ETag·Last-Modified·캐시 정책 · 본문 그대로", async () => {
    const r = fileResponse(req(), file);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("video/mp4");
    expect(r.headers.get("content-length")).toBe("5000");
    expect(r.headers.get("accept-ranges")).toBe("bytes");
    expect(r.headers.get("etag")).toMatch(/^W\/"[0-9a-f]+-[0-9a-f]+"$/);
    expect(r.headers.get("last-modified")).toMatch(/GMT$/);
    expect(r.headers.get("cache-control")).toBe("private, max-age=300");
    expect((await bytes(r)).equals(body)).toBe(true);
  });

  it("구간: 206 · 그 구간만(앞·가운데·끝 n바이트)", async () => {
    const a = fileResponse(req({ range: "bytes=0-1023" }), file);
    expect(a.status).toBe(206);
    expect(a.headers.get("content-range")).toBe("bytes 0-1023/5000");
    expect(a.headers.get("content-length")).toBe("1024");
    expect((await bytes(a)).equals(body.subarray(0, 1024))).toBe(true);
    const b = fileResponse(req({ range: "bytes=4000-" }), file);
    expect(b.headers.get("content-range")).toBe("bytes 4000-4999/5000");
    expect((await bytes(b)).equals(body.subarray(4000))).toBe(true);
    const c = fileResponse(req({ range: "bytes=-100" }), file);
    expect(c.headers.get("content-range")).toBe("bytes 4900-4999/5000");
    expect((await bytes(c)).equals(body.subarray(4900))).toBe(true);
  });

  it("범위를 벗어나면 416", () => {
    const r = fileResponse(req({ range: "bytes=9000-9100" }), file);
    expect(r.status).toBe(416);
    expect(r.headers.get("content-range")).toBe("bytes */5000");
  });

  it("같은 ETag 로 다시 물으면 304(본문 없음), 다른 ETag·없으면 200", async () => {
    const etag = fileResponse(req(), file).headers.get("etag")!;
    const hit = fileResponse(req({ "if-none-match": etag }), file);
    expect(hit.status).toBe(304);
    expect(hit.headers.get("etag")).toBe(etag);
    expect((await bytes(hit)).length).toBe(0);
    expect(fileResponse(req({ "if-none-match": `${etag}, W/"zzz"` }), file).status).toBe(304);
    expect(fileResponse(req({ "if-none-match": 'W/"zzz"' }), file).status).toBe(200);
  });

  it("파일이 바뀌면 ETag 도 바뀐다", () => {
    const f = join(dir, "b.png");
    writeFileSync(f, "one");
    const e1 = fileResponse(req(), f).headers.get("etag");
    writeFileSync(f, "three");
    expect(fileResponse(req(), f).headers.get("etag")).not.toBe(e1);
  });

  it("cacheControl·download 옵션, 경로 없음·사라진 파일은 404, 빈 파일은 200", async () => {
    const r = fileResponse(req(), file, { cacheControl: "public, max-age=86400", download: "x.mp4" });
    expect(r.headers.get("cache-control")).toBe("public, max-age=86400");
    expect(r.headers.get("content-disposition")).toBe('attachment; filename="x.mp4"');
    expect(fileResponse(req(), null).status).toBe(404);
    expect(fileResponse(req(), join(dir, "nope.png")).status).toBe(404);
    const empty = join(dir, "e.png");
    writeFileSync(empty, "");
    const e = fileResponse(req(), empty);
    expect(e.status).toBe(200);
    expect((await bytes(e)).length).toBe(0);
  });
});
