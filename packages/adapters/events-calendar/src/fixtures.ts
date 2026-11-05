// 테스트 전용 도우미 — 녹화한 응답 픽스처를 읽고, 네트워크 없이 그 응답을 돌려주는 가짜 fetch 를 만든다.
import { readFileSync } from "node:fs";
import type { FetchLike } from "./http";

export const fixture = (name: string): string => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8");

export interface FakeReply {
  status?: number;
  type?: string;
  body: string;
}

/** url → 응답. 등록되지 않은 주소는 즉시 실패시켜 테스트가 실제 네트워크로 나가지 않았음을 보인다 */
export function fakeFetch(routes: Record<string, FakeReply>): FetchLike & { calls: { url: string; userAgent: string | undefined }[] } {
  const calls: { url: string; userAgent: string | undefined }[] = [];
  const fn = (async (url: string, init?: { headers?: Record<string, string> }) => {
    calls.push({ url, userAgent: init?.headers?.["user-agent"] });
    const reply = routes[url];
    if (!reply) throw new Error(`테스트에서 허용하지 않은 주소: ${url}`);
    const status = reply.status ?? 200;
    return { ok: status >= 200 && status < 300, status, headers: { get: (name: string) => (name.toLowerCase() === "content-type" ? (reply.type ?? "text/plain") : null) }, text: async () => reply.body };
  }) as FetchLike & { calls: typeof calls };
  fn.calls = calls;
  return fn;
}
