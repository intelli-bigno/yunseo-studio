// L5(게시·성과)의 약속을 소스로 고정한다 — ① 게시 어댑터는 dry-run 전용(실제 호출 코드·토큰 저장소·자격 증명 입력 칸 없음)
// ② 성과 어댑터는 자기 테이블(l5_*)만 만진다 ③ 새 패키지는 쓰는 workspace 의존을 선언한다.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SPEC_EVIDENCE } from "../packages/domain/src/publish/evidence";

const root = fileURLToPath(new URL("..", import.meta.url));
const SKIP = new Set(["node_modules", ".next", "dist", "coverage"]);

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (SKIP.has(e.name) ? [] : e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
}

const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const isTest = (f: string) => /\.test\.tsx?$/.test(f);
const sources = (dir: string) => walk(join(root, dir)).filter((f) => /\.(ts|tsx)$/.test(f) && !isTest(f));
const rel = (f: string) => relative(root, f).split("\\").join("/");

/** 게시 경로를 이루는 코드 전부 */
const PUBLISH_DIRS = ["packages/adapters/publisher-instagram/src", "packages/adapters/publisher-youtube/src", "packages/domain/src/publish", "packages/application/src/publishing"];
// 게시·성과 화면(app/publish·app/performance·l5.tsx·CsvImport.tsx)은 W1 탭 정리(7c9c3c2)에서 삭제됐다. 남은 대시보드 화면 전체를 검사한다.
const PUBLISH_SCREENS = ["apps/dashboard/src/app", "apps/dashboard/src/components"];

// 주소 문자열(데이터)은 계획에 들어가므로 막지 않는다 — 막는 것은 호출 코드와 호출용 라이브러리 import 다.
const NETWORK = /\bfetch\s*\(|XMLHttpRequest|\bWebSocket\b|node:(?:https?|http2|net|tls|dns|dgram)\b|from\s*["'](?:googleapis|@googleapis\/[^"']*|google-auth-library|facebook-nodejs-business-sdk|node-fetch|axios|got|undici|superagent|ky)["']/i;
const SECRETS = /process\.env|access_token|refresh_token|client_secret|api[_-]?key|\bpassword\b|authorization\s*:|\bbearer\s+[A-Za-z0-9]/i;
const CREDENTIAL_INPUT = /type=["']password["']|name=["'][^"']*(?:token|secret|password|api_?key)[^"']*["']/i;

describe("게시 어댑터는 dry-run 전용이다", () => {
  const files = PUBLISH_DIRS.flatMap(sources);

  it("소스를 충분히 읽었다(스캐너 자체 점검)", () => {
    expect(files.map(rel)).toEqual(expect.arrayContaining(["packages/adapters/publisher-instagram/src/dry-run-planner.ts", "packages/adapters/publisher-youtube/src/dry-run-planner.ts", "packages/domain/src/publish/check.ts", "packages/application/src/publishing/use-cases.ts"]));
  });

  it("네트워크 호출 코드(fetch·http·소켓·SDK)가 없다", () => {
    for (const f of files) expect(strip(readFileSync(f, "utf8")), rel(f)).not.toMatch(NETWORK);
  });

  it("환경변수·토큰·비밀 이름이 없다 — 자격 증명을 읽거나 저장하는 곳이 없다", () => {
    for (const f of files) expect(strip(readFileSync(f, "utf8")), rel(f)).not.toMatch(SECRETS);
  });

  it("파일 시스템에 쓰지 않는다(토큰 파일·캐시)", () => {
    for (const f of files) expect(strip(readFileSync(f, "utf8")), rel(f)).not.toMatch(/\b(?:writeFile|appendFile|createWriteStream|mkdir)\b/);
  });

  it("두 게시 패키지는 application·domain 만 의존한다(HTTP·SDK 의존 없음)", () => {
    for (const dir of ["packages/adapters/publisher-instagram", "packages/adapters/publisher-youtube"]) {
      const json = JSON.parse(readFileSync(join(root, dir, "package.json"), "utf8")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
      expect(Object.keys({ ...json.dependencies, ...json.devDependencies }).sort(), dir).toEqual(["@yunseo/application", "@yunseo/domain"]);
    }
  });

  it("계획 모델은 영구히 dry-run 이고 게시 실행 메서드가 포트에 없다", () => {
    const ports = strip(readFileSync(join(root, "packages/application/src/publishing/ports.ts"), "utf8"));
    expect(ports).not.toMatch(/\b(?:publish|execute|run|send|upload)\s*\(/);
    expect(strip(readFileSync(join(root, "packages/domain/src/publish/plan.ts"), "utf8"))).toContain('mode: "dry-run"');
  });
});

describe("화면에 자격 증명 입력 칸이 없다", () => {
  const files = PUBLISH_SCREENS.flatMap((p) => (p.endsWith(".tsx") ? [join(root, p)] : sources(p)));

  it("소스를 충분히 읽었다", () => {
    expect(files.length).toBeGreaterThanOrEqual(31);
  });

  it("비밀번호·토큰·키 입력 칸과 네트워크 호출이 없다", () => {
    for (const f of files) {
      const src = strip(readFileSync(f, "utf8"));
      // 같은 출처 상대경로(fetch("/api/...")) 내부 조회만 허용한다. 절대 URL·외부 호스트·자격 증명 호출은 계속 막는다.
      const external = src.replace(/\bfetch\s*\(\s*(["'`])\/(?!\/)[^"'`]*\1/g, "");
      expect(src, rel(f)).not.toMatch(CREDENTIAL_INPUT);
      expect(external, rel(f)).not.toMatch(NETWORK);
    }
  });
});

describe("성과 어댑터", () => {
  it("l5_ 접두사 테이블만 만들고 읽고 쓴다 — 기존 테이블을 만지지 않는다", () => {
    for (const f of sources("packages/adapters/metrics/src")) {
      const src = strip(readFileSync(f, "utf8"));
      const tables = [...src.matchAll(/\b(?:FROM|INTO|(?<!DO\s)UPDATE|TABLE(?:\s+IF\s+NOT\s+EXISTS)?|INDEX(?:\s+IF\s+NOT\s+EXISTS)?\s+\w+\s+ON)\s+(\w+)/gi)].map((m) => m[1]!);
      for (const t of tables) expect(t, `${rel(f)} → ${t}`).toMatch(/^l5_/);
    }
  });
});

describe("새 패키지의 workspace 의존 선언", () => {
  it.each(["packages/adapters/publisher-instagram", "packages/adapters/publisher-youtube", "packages/adapters/metrics"])("%s 가 import 하는 @yunseo/* 는 package.json 에 선언돼 있다", (dir) => {
    const json = JSON.parse(readFileSync(join(root, dir, "package.json"), "utf8")) as { dependencies?: Record<string, string> };
    const declared = new Set(Object.keys(json.dependencies ?? {}));
    for (const f of walk(join(root, dir, "src")).filter((x) => /\.ts$/.test(x))) {
      for (const m of strip(readFileSync(f, "utf8")).matchAll(/from\s*["'](@yunseo\/[^"'/]+)/g)) expect(declared.has(m[1]!), `${rel(f)} 가 선언 없이 ${m[1]} 을 import`).toBe(true);
    }
  });
});

describe("규격 근거 문서", () => {
  const doc = readFileSync(join(root, "docs/05-automation.md"), "utf8");

  it("evidence.ts 의 모든 항목(id·문서 주소·확인일)이 docs/05 §5.8 에 있다 — 코드와 문서가 어긋나지 않는다", () => {
    for (const e of SPEC_EVIDENCE) {
      expect(doc, `${e.id} id`).toContain(`\`${e.id}\``);
      expect(doc, `${e.id} 주소`).toContain(e.url);
      expect(doc, `${e.id} 확인일`).toContain(`확인 ${e.checkedAt}`);
      expect(doc, `${e.id} 원문 인용`).toContain(e.quote.replace(/\|/g, "\\|"));
    }
  });

  it("예전 [미검증] 가정 문구가 남아 있지 않다 (실측 결과로 바뀌었다)", () => {
    for (const old of ["상한 수치는 버전마다 바뀌어 왔으므로", "하루 약 6회 [미검증", "이미지 형식은 JPEG 만 허용되는 것으로 알려져 있다 [미검증]", "길이 상한 3분으로 확대된 것으로 알려짐 [미검증]"]) expect(doc, old).not.toContain(old);
    expect(doc).toContain("바뀜");
  });
});
