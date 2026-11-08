// 모든 /api 라우트가 공통 래퍼(route)를 쓰고, 오류 응답을 손으로 만들지 않는다 — 새 라우트가 규칙을 빠뜨리면 여기서 걸린다.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url));
const api = join(root, "apps/dashboard/src/app/api");
const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
const routes = walk(api).filter((f) => f.endsWith("/route.ts"));
const METHOD = /export\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g;

describe("API 라우트 공통 래퍼", () => {
  it("라우트를 충분히 찾았다(스캐너 자체 점검)", () => {
    expect(routes.length).toBeGreaterThanOrEqual(19);
  });

  it.each(routes.map((f) => [relative(root, f)] as const))("%s — 모든 메서드가 route() 로 감싸여 있다", (rel) => {
    const src = readFileSync(join(root, rel), "utf8");
    const methods = [...src.matchAll(METHOD)].map((m) => m[1]!);
    expect(methods.length).toBeGreaterThan(0);
    for (const m of methods) {
      expect(src, `${rel} ${m}`).toMatch(new RegExp(`export const ${m} = route\\(`));
      expect(src, `${rel} ${m}`).not.toMatch(new RegExp(`export\\s+(async\\s+)?function\\s+${m}\\b`));
    }
    expect(src).toMatch(/from "@\/server\/api"/);
  });

  it.each(routes.map((f) => [relative(root, f)] as const))("%s — 오류 응답을 손으로 만들지 않는다(옛 모양 금지)", (rel) => {
    const src = readFileSync(join(root, rel), "utf8");
    expect(src).not.toMatch(/Response\.json\(\s*\{\s*errors?\s*:/); // {error:"…"}·{errors:[…]}
    expect(src).not.toMatch(/new Response\(\s*["'`]/); // 문자열 본문("not found" 등)
    expect(src).not.toMatch(/status:\s*(4|5)\d\d\b/); // 상태는 던진 오류(AppError)나 유스케이스 응답에서만
  });
});
