// 선언된 의존(package.json)이 docs/04-architecture.md 의 의존 규칙을 지키는지 본다.
// import 문 단위 검사는 eslint.config.mjs 가 맡는다 — 두 검사가 함께 경계를 지킨다.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url));

interface Pkg {
  dir: string;
  name: string;
  deps: string[];
}

function read(dir: string): Pkg | null {
  const file = join(root, dir, "package.json");
  if (!existsSync(file)) return null;
  const json = JSON.parse(readFileSync(file, "utf8")) as {
    name: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  return { dir, name: json.name, deps: Object.keys({ ...json.dependencies, ...json.devDependencies }) };
}

function list(parent: string): Pkg[] {
  return readdirSync(join(root, parent), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .flatMap((e) => read(join(parent, e.name)) ?? []);
}

const workspace = (p: Pkg) => p.deps.filter((d) => d.startsWith("@yunseo/"));
const adapters = list("packages/adapters");
const presets = read("packages/presets-schema");
const apps = list("apps");

describe("의존 경계 (선언 의존)", () => {
  it("domain 은 어떤 패키지에도 의존하지 않는다", () => {
    expect(read("packages/domain")?.deps).toEqual([]);
  });

  it("application 은 domain 만 안다", () => {
    const application = read("packages/application");
    expect(application && workspace(application)).toEqual(["@yunseo/domain"]);
    expect(application?.deps.filter((d) => !d.startsWith("@yunseo/"))).toEqual([]);
  });

  it("어댑터(presets-schema 포함)는 domain·application 만 workspace 에서 가져온다", () => {
    expect(adapters.length).toBeGreaterThan(0);
    for (const p of [...adapters, ...(presets ? [presets] : [])]) {
      const bad = workspace(p).filter((d) => d !== "@yunseo/domain" && d !== "@yunseo/application");
      expect(bad, `${p.name} 이 ${bad.join(", ")} 에 의존`).toEqual([]);
    }
  });

  it("apps 는 서로 의존하지 않는다", () => {
    expect(apps.length).toBeGreaterThan(0);
    for (const p of apps) {
      expect(workspace(p).filter((d) => d.startsWith("@yunseo/app-")), p.name).toEqual([]);
    }
  });

  it("packages 는 apps 에 의존하지 않는다", () => {
    for (const p of [read("packages/domain"), read("packages/application"), presets, ...adapters]) {
      expect(p && workspace(p).filter((d) => d.startsWith("@yunseo/app-")), p?.name).toEqual([]);
    }
  });
});
