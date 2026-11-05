// import 그래프 전체를 훑어 docs/04-architecture.md 의 계층·의존 규칙을 검사한다.
// (eslint.config.mjs 는 파일 단위로 막고, 이 테스트는 「누가 무엇을 import 하는가」의 전체 모양을 고정한다.)
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url));
const SKIP = new Set(["node_modules", ".next", "dist", "coverage"]);

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (SKIP.has(e.name) ? [] : e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
}

const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

function importsOf(file: string): string[] {
  const src = strip(readFileSync(file, "utf8"));
  const out: string[] = [];
  for (const m of src.matchAll(/(?:^|[\s;])(?:import|export)\s[^;'"]*?from\s*["']([^"']+)["']/g)) out.push(m[1]!);
  for (const m of src.matchAll(/(?:^|[\s;])import\s*["']([^"']+)["']/g)) out.push(m[1]!);
  for (const m of src.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) out.push(m[1]!);
  return out;
}

interface Source {
  rel: string;
  abs: string;
  imports: string[];
  test: boolean;
}

const sources: Source[] = ["apps", "packages"].flatMap((top) =>
  walk(join(root, top))
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .map((abs) => ({ abs, rel: relative(root, abs).split("\\").join("/"), imports: importsOf(abs), test: /\.test\.tsx?$/.test(abs) })),
);

const inDir = (dir: string) => sources.filter((s) => s.rel.startsWith(`${dir}/`));
const prod = (list: Source[]) => list.filter((s) => !s.test);
const isRelative = (spec: string) => spec.startsWith("./") || spec.startsWith("../");
const external = (list: Source[]) => list.flatMap((s) => s.imports.filter((i) => !isRelative(i)).map((i) => ({ file: s.rel, spec: i })));

describe("import 그래프 — 계층 규칙", () => {
  it("소스를 충분히 읽었다(스캐너 자체 점검)", () => {
    expect(sources.length).toBeGreaterThan(40);
    expect(inDir("apps/dashboard/src").length).toBeGreaterThan(15);
  });

  it("domain: 상대 경로만 import 한다 (규칙 1)", () => {
    expect(external(prod(inDir("packages/domain/src")))).toEqual([]);
  });

  it("application: domain 과 상대 경로만 — Node 내장·SDK 없음 (규칙 2)", () => {
    const bad = external(prod(inDir("packages/application/src"))).filter((e) => e.spec !== "@yunseo/domain");
    expect(bad).toEqual([]);
  });

  it("application: 환경변수·네트워크·파일을 직접 만지지 않는다 (포트 뒤로)", () => {
    for (const s of prod(inDir("packages/application/src"))) {
      expect(strip(readFileSync(s.abs, "utf8")), s.rel).not.toMatch(/process\.env|\bfetch\(|readFile|writeFile/);
    }
  });

  it("어댑터: application·domain 과 Node 내장만 — 다른 어댑터·화면 계층 없음 (규칙 3). 렌더 어댑터만 래스터 라이브러리(satori·resvg)를 더 쓴다", () => {
    const bad = external(prod(inDir("packages/adapters")))
      .filter((e) => e.spec !== "@yunseo/application" && e.spec !== "@yunseo/domain" && !e.spec.startsWith("node:"))
      .filter((e) => !(e.file.startsWith("packages/adapters/render-html/") && (e.spec === "satori" || e.spec === "@resvg/resvg-js")));
    expect(bad).toEqual([]);
  });

  it("ui: react 와 design-tokens 만", () => {
    const bad = external(prod(inDir("packages/ui/src"))).filter((e) => e.spec !== "react" && e.spec !== "@yunseo/design-tokens");
    expect(bad).toEqual([]);
  });

  it("packages 는 apps 를 import 하지 않고, 자기 패키지 밖 상대 경로로 나가지 않는다", () => {
    for (const s of sources.filter((x) => x.rel.startsWith("packages/"))) {
      const pkgRoot = s.rel.startsWith("packages/adapters/") ? s.rel.split("/").slice(0, 3).join("/") : s.rel.split("/").slice(0, 2).join("/");
      for (const spec of s.imports) {
        expect(spec.startsWith("@yunseo/app-"), `${s.rel} → ${spec}`).toBe(false);
        if (isRelative(spec)) expect(relative(root, resolve(dirname(s.abs), spec)).split("\\").join("/").startsWith(pkgRoot), `${s.rel} → ${spec}`).toBe(true);
      }
    }
  });
});

describe("import 그래프 — 대시보드 (apps 는 조립만, 화면은 유스케이스만)", () => {
  const dash = inDir("apps/dashboard/src");

  it("어댑터를 import 하는 파일은 조립부 하나뿐이다 (규칙 4)", () => {
    const importers = dash.filter((s) => s.imports.some((i) => i.startsWith("@yunseo/adapters-"))).map((s) => s.rel);
    expect(importers).toEqual(["apps/dashboard/src/server/studio.ts"]);
  });

  it("Node 내장 모듈은 server/ 안에서만 쓴다", () => {
    const bad = prod(dash).filter((s) => !s.rel.includes("/src/server/") && s.imports.some((i) => i.startsWith("node:")));
    expect(bad.map((s) => s.rel)).toEqual([]);
  });

  it("클라이언트 섬(components/)은 유스케이스·서버 조립부·어댑터를 가져오지 않는다", () => {
    for (const s of dash.filter((x) => x.rel.includes("/src/components/"))) {
      const bad = s.imports.filter((i) => i.startsWith("@yunseo/application") || i.startsWith("@yunseo/adapters-") || i.startsWith("@/server/") || /(^|\/)server\//.test(i));
      expect(bad, s.rel).toEqual([]);
    }
  });

  it("화면은 옛 목업 모듈을 쓰지 않는다 (데이터는 유스케이스에서만)", () => {
    for (const s of dash) {
      expect(s.imports.filter((i) => /\/lib\/(mock|model|logic|cards)$/.test(i) || /^\.\/(mock|model|logic|cards)$/.test(i)), s.rel).toEqual([]);
    }
    expect(existsSync(join(root, "apps/dashboard/src/lib/mock.ts"))).toBe(false);
  });
});

describe("import 그래프 — 선언한 의존만 쓴다", () => {
  it("각 패키지가 import 하는 @yunseo/* 는 모두 package.json 에 선언돼 있다", () => {
    const roots = ["apps/cli", "apps/dashboard", "apps/worker", "packages/domain", "packages/application", "packages/design-tokens", "packages/ui", "packages/presets-schema", "packages/adapters/storage", "packages/adapters/render-html", "packages/adapters/publisher-manual"];
    for (const dir of roots) {
      const file = join(root, dir, "package.json");
      if (!existsSync(file)) continue;
      const json = JSON.parse(readFileSync(file, "utf8")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
      const declared = new Set(Object.keys({ ...json.dependencies, ...json.devDependencies }));
      for (const s of inDir(`${dir}/src`)) {
        for (const spec of s.imports.filter((i) => i.startsWith("@yunseo/"))) {
          const name = spec.split("/").slice(0, 2).join("/");
          expect(declared.has(name), `${s.rel} 가 선언 없이 ${name} 을 import`).toBe(true);
        }
      }
    }
  });
});
