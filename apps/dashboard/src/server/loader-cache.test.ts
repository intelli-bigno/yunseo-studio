// 서버 메모리 캐시 — 한 번만 불러온다·동시 요청은 합친다·상한 안에서 LRU·실패는 남기지 않는다·무효화
import { describe, expect, it } from "vitest";
import { createLoaderCache } from "./loader-cache";

const item = (bytes: number, tag = "") => ({ bytes, tag });

describe("createLoaderCache", () => {
  it("같은 키는 한 번만 불러오고 두 번째부터는 메모리에서 준다", async () => {
    const c = createLoaderCache<ReturnType<typeof item>>({ maxEntries: 4, maxBytes: 100 });
    let calls = 0;
    const load = async () => (calls++, item(10, "a"));
    expect((await c.get("a", load))?.tag).toBe("a");
    expect((await c.get("a", load))?.tag).toBe("a");
    expect(calls).toBe(1);
  });

  it("같은 키의 동시 요청은 불러오기 한 번을 나눠 쓴다", async () => {
    const c = createLoaderCache<ReturnType<typeof item>>({ maxEntries: 4, maxBytes: 100 });
    let calls = 0;
    const load = async () => (calls++, await new Promise((r) => setTimeout(r, 10)), item(10));
    const got = await Promise.all([c.get("a", load), c.get("a", load), c.get("a", load), c.get("a", load), c.get("a", load)]);
    expect(calls).toBe(1);
    expect(new Set(got).size).toBe(1);
    expect(c.stats().inflight).toBe(0);
  });

  it("항목 수·바이트 상한을 넘으면 가장 오래 안 쓴 것부터 버린다(읽으면 최근으로)", async () => {
    const c = createLoaderCache<ReturnType<typeof item>>({ maxEntries: 3, maxBytes: 1000 });
    for (const k of ["a", "b", "c"]) await c.get(k, async () => item(10, k));
    await c.get("a", async () => item(10, "again")); // a 를 최근으로
    await c.get("d", async () => item(10, "d")); // 상한 3 → 가장 오래된 b 가 나간다
    let reloaded = 0;
    await c.get("b", async () => (reloaded++, item(10, "b2")));
    await c.get("a", async () => (reloaded++, item(10)));
    expect(reloaded).toBe(1); // b 만 다시 불러왔고 a 는 남아 있었다
    expect(c.stats().entries).toBeLessThanOrEqual(3);
    const bytes = createLoaderCache<ReturnType<typeof item>>({ maxEntries: 99, maxBytes: 25 });
    for (const k of ["x", "y", "z"]) await bytes.get(k, async () => item(10));
    expect(bytes.stats()).toMatchObject({ entries: 2, bytes: 20 });
  });

  it("상한보다 큰 항목은 두지 않고, 실패(null·예외)는 남기지 않는다", async () => {
    const c = createLoaderCache<ReturnType<typeof item>>({ maxEntries: 4, maxBytes: 50 });
    await c.get("big", async () => item(60));
    expect(c.stats().entries).toBe(0);
    expect(await c.get("nul", async () => null)).toBeNull();
    await expect(c.get("err", async () => Promise.reject(new Error("x")))).rejects.toThrow("x");
    expect(c.stats()).toEqual({ entries: 0, bytes: 0, inflight: 0 });
    let calls = 0;
    await c.get("err", async () => (calls++, item(5)));
    expect(calls).toBe(1); // 실패 뒤 다음 요청은 다시 시도한다
  });

  it("invalidate 는 키를 지우고, 진행 중인 불러오기 결과도 남기지 않는다", async () => {
    const c = createLoaderCache<ReturnType<typeof item>>({ maxEntries: 4, maxBytes: 100 });
    await c.get("a", async () => item(10, "old"));
    c.invalidate("a");
    expect(c.stats().entries).toBe(0);
    const slow = c.get("b", async () => (await new Promise((r) => setTimeout(r, 10)), item(10)));
    c.invalidate("b");
    await slow;
    expect(c.stats().entries).toBe(0);
  });
});
