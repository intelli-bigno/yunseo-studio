import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BEA_ICS_URL, BLS_ICS_URL, FED_CALENDAR_URL, type FetchLike } from "@yunseo/adapters-events-calendar";
import { runEvents } from "./events";

// 녹화 픽스처는 어댑터 패키지에 있다 — CLI 는 그 응답을 돌려주는 가짜 fetch 로 시험한다(네트워크 금지)
const fx = (name: string) => readFileSync(new URL(`../../../packages/adapters/events-calendar/fixtures/${name}`, import.meta.url), "utf8");

const reply = (type: string, body: string, status = 200) => ({ ok: status < 400, status, headers: { get: (n: string) => (n.toLowerCase() === "content-type" ? type : null) }, text: async () => body });
const fakeFetch = (blocked: string[] = []): FetchLike & { calls: string[] } => {
  const calls: string[] = [];
  const fn = (async (url: string) => {
    calls.push(url);
    if (blocked.includes(url)) return reply("text/html", "denied", 403);
    if (url === FED_CALENDAR_URL) return reply("application/json", fx("fed-calendar.json"));
    if (url === BLS_ICS_URL) return reply("text/calendar", fx("bls-trimmed.ics"));
    if (url === BEA_ICS_URL) return reply("text/plain", fx("bea-trimmed.ics"));
    throw new Error(`허용하지 않은 주소 ${url}`);
  }) as FetchLike & { calls: string[] };
  fn.calls = calls;
  return fn;
};
const NOW = "2026-11-05T00:00:00Z";

describe("events fetch --dry", () => {
  it("공식 원천을 받아 저장 없이 개수를 보고한다 — 종료 0", async () => {
    const f = fakeFetch();
    const { code, lines } = await runEvents(["fetch", "--dry", "--sample", "3"], { fetch: f, now: () => NOW });
    expect(code).toBe(0);
    const text = lines.join("\n");
    expect(text).toContain("✓ fed-calendar");
    expect(text).toContain("✓ bls-ics");
    expect(text).toContain("✓ bea-ics");
    expect(text).toMatch(/합계 \d+건 \(성공 3\/3 원천\)/);
    expect(text).toContain("저장하지 않음 (--dry)");
    expect(text).toContain("다음 일정 3건");
    expect(f.calls).toEqual([FED_CALENDAR_URL, BLS_ICS_URL, BEA_ICS_URL]);
  });

  it("다음 일정은 KST 와 자동 제안으로 보인다", async () => {
    const { lines } = await runEvents(["fetch", "--dry", "--sample", "30"], { fetch: fakeFetch(), now: () => NOW });
    expect(lines.join("\n")).toContain("11.06 금 22:30 watch 미국 고용보고서(비농업 고용·실업률)  [bls-ics]");
  });

  it("--source 로 원천을 고른다", async () => {
    const f = fakeFetch();
    const { lines } = await runEvents(["fetch", "--dry", "--source", "bls-ics"], { fetch: f, now: () => NOW });
    expect(f.calls).toEqual([BLS_ICS_URL]);
    expect(lines.join("\n")).toMatch(/성공 1\/1 원천/);
  });

  it("한 원천이 막히면(403) 그 원천만 ✗ 로 보고하고 종료 1", async () => {
    const { code, lines } = await runEvents(["fetch", "--dry"], { fetch: fakeFetch([BLS_ICS_URL]), now: () => NOW });
    expect(code).toBe(1);
    const text = lines.join("\n");
    expect(text).toContain("✗ bls-ics");
    expect(text).toContain("HTTP 403");
    expect(text).toContain("✓ fed-calendar");
  });

  it("--dry 없이는 실행하지 않고 워커 진입점을 안내한다 (종료 2, 네트워크 호출 없음)", async () => {
    const f = fakeFetch();
    const { code, lines } = await runEvents(["fetch"], { fetch: f, now: () => NOW });
    expect(code).toBe(2);
    expect(lines.join("\n")).toContain("collect-events");
    expect(f.calls).toEqual([]);
  });

  it("알 수 없는 하위 명령·원천은 종료 2", async () => {
    expect((await runEvents(["list"], { fetch: fakeFetch(), now: () => NOW })).code).toBe(2);
    expect((await runEvents(["fetch", "--dry", "--source", "nope"], { fetch: fakeFetch(), now: () => NOW })).code).toBe(2);
  });
});
