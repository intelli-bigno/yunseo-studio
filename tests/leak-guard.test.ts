// 메모리 누수 정적 점검 — 브라우저에서 오래 켜 두는 운영 화면이라, 만든 것을 거두지 않는 코드를 소스 단위로 막는다.
// (런타임 점검은 docs/09-performance.md §7 의 표. 여기서는 짝이 맞는지만 본다 — 짝 없는 것이 누수의 거의 전부다.)
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url));
const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const count = (src: string, re: RegExp) => (src.match(re) ?? []).length;

const files = [...walk(join(root, "apps/dashboard/src")), ...walk(join(root, "packages/ui/src"))]
  .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
  .map((f) => ({ rel: relative(root, f).split("\\").join("/"), src: strip(readFileSync(f, "utf8")) }));

describe("누수 점검 (소스 짝 맞추기)", () => {
  it("스캐너가 파일을 읽었다", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("addEventListener 마다 removeEventListener 가 있다", () => {
    for (const f of files) expect(count(f.src, /\.addEventListener\(/g), f.rel).toBe(count(f.src, /\.removeEventListener\(/g));
  });

  it("setInterval·setTimeout 은 거두는 코드(clearInterval·clearTimeout)와 함께만 쓴다", () => {
    for (const f of files) {
      if (/\bsetInterval\(/.test(f.src)) expect(f.src, f.rel).toMatch(/\bclearInterval\(/);
      if (/\bsetTimeout\(/.test(f.src)) expect(f.src, f.rel).toMatch(/\bclearTimeout\(/);
    }
  });

  it("ResizeObserver·IntersectionObserver·MutationObserver 는 disconnect 한다", () => {
    for (const f of files) {
      const made = count(f.src, /new (?:Resize|Intersection|Mutation)Observer\(/g);
      if (made) expect(count(f.src, /\.disconnect\(\)/g), f.rel).toBeGreaterThanOrEqual(made);
    }
  });

  it("클라이언트 섬의 fetch 는 취소 신호(signal)를 받는다", () => {
    for (const f of files.filter((x) => x.rel.includes("/components/"))) {
      if (/\bfetch\(/.test(f.src) || /\bloadEntries\(/.test(f.src)) expect(f.src, f.rel).toMatch(/AbortController|signal/);
    }
  });
});
