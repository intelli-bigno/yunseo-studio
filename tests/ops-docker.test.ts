// [L9] ops/docker — Windows WSL Docker 상주 설정의 노출 경계·복귀 설정을 정적으로 고정한다.
// 실제 빌드·기동·헬스는 windows-desktop 에서 실측한다(ops/docker/README.md).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { assertSafeHost } from "../apps/worker/src/config";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const compose = read("compose.yaml");
const dockerfile = read("Dockerfile");
const install = read("ops/docker/mac-tunnel/install.sh");

/** 최상위 services 아래 한 서비스 블록(다음 서비스·최상위 키 전까지) */
function service(name: string): string {
  const m = compose.match(new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  \\w[\\w-]*:\\n|^\\w)`, "m"));
  if (!m) throw new Error(`서비스 없음: ${name}`);
  return m[1]!;
}

describe("compose — 노출 경계", () => {
  it("publish 하는 포트는 전부 127.0.0.1 로만 연다(LAN·Tailnet·인터넷 없음)", () => {
    const ports = [...compose.matchAll(/^\s+- "([^"]*\d+:\d+(?:\/\w+)?)"$/gm)].map((m) => m[1]!);
    expect(ports).toEqual(["127.0.0.1:8930:8930"]);
  });

  it("워커는 포트를 publish 하지 않고 대시보드와 네트워크를 공유하며 루프백에만 바인드한다", () => {
    const worker = service("worker");
    expect(worker).not.toMatch(/^\s+ports:/m);
    expect(worker).toMatch(/network_mode: "service:dashboard"/);
    expect(worker).toMatch(/HOST: 127\.0\.0\.1/);
    expect(() => assertSafeHost("127.0.0.1")).not.toThrow();
    expect(() => assertSafeHost("0.0.0.0")).toThrow(); // 코드의 바인드 검사는 그대로다 — 컨테이너 때문에 풀지 않았다
  });

  it("대시보드는 컨테이너 안에서 0.0.0.0:8930 으로 듣고 헬스 확인이 있다", () => {
    const d = service("dashboard");
    expect(d).toMatch(/"-H", "0\.0\.0\.0", "-p", "8930"/);
    expect(d).toMatch(/api\/health/);
    expect(service("worker")).toMatch(/depends_on:\s+dashboard:\s+condition: service_healthy/);
  });
});

describe("compose — 복귀·데이터", () => {
  it("두 서비스 모두 unless-stopped 공통 설정을 쓴다", () => {
    expect(compose).toMatch(/x-service: &service\n(?:.*\n)*?\s+restart: unless-stopped/);
    expect(service("dashboard")).toMatch(/<<: \*service/);
    expect(service("worker")).toMatch(/<<: \*service/);
  });

  it("SQLite 는 이름 있는 볼륨(/data)에 있고 볼륨 이름이 고정이다", () => {
    expect(compose).toMatch(/STUDIO_DB: \/data\/studio\.db/);
    expect(compose).toMatch(/volumes:\n\s+- data:\/data/);
    expect(compose).toMatch(/^volumes:\n  data:\n    name: yunseo-studio-data$/m);
    expect(compose).not.toMatch(/\/mnt\/d/); // 9p 위 SQLite WAL 금지
  });

  it("실제 운영 데이터 모드(STUDIO_CLOCK=system)와 KST", () => {
    expect(compose).toMatch(/STUDIO_CLOCK: system/);
    expect(compose).toMatch(/TZ: Asia\/Seoul/);
  });
});

describe("Dockerfile·.dockerignore", () => {
  it("pnpm 버전이 package.json packageManager 와 같다", () => {
    const pm = (JSON.parse(read("package.json")) as { packageManager: string }).packageManager; // pnpm@x.y.z
    expect(dockerfile).toContain(`npm install -g ${pm}`);
  });

  it("잠금 파일 고정 설치·ffmpeg·비루트 실행", () => {
    expect(dockerfile).toMatch(/pnpm install --frozen-lockfile/);
    expect(dockerfile).toMatch(/\bffmpeg\b/);
    expect(dockerfile).toMatch(/^USER node$/m);
  });

  it("node_modules·.next·.git·.env 는 빌드 입력에서 뺀다", () => {
    const ignore = read(".dockerignore").split("\n");
    for (const p of ["**/node_modules", "**/.next", ".git", ".env"]) expect(ignore).toContain(p);
  });
});

describe("Mac 터널 설치기", () => {
  it("Mac 127.0.0.1:8930 → Windows 127.0.0.1:8930 만 연다(0.0.0.0 없음)", () => {
    expect(install).toContain("PORT=8930");
    expect(install).toContain("<string>127.0.0.1:$PORT:127.0.0.1:$PORT</string>");
    expect(install).not.toContain("0.0.0.0");
    expect(install).toContain("windows-desktop");
  });

  it("launchd 함정: 로그는 내장 디스크, ssh 는 bash 가 exec", () => {
    expect(install).toContain('LOG_DIR="$HOME/Library/Logs/yunseo-studio-tunnel"');
    expect(install).not.toMatch(/StandardOutPath[^\n]*\/Volumes\//);
    expect(install).toContain('<string>exec "\\$0" "\\$@"</string>');
  });

  it("셸 스크립트 문법(bash -n)", () => {
    for (const f of ["ops/docker/ctl.sh", "ops/docker/remote.sh", "ops/docker/mac-tunnel/install.sh"]) {
      expect(() => execFileSync("bash", ["-n", join(root, f)]), f).not.toThrow();
    }
  });
});
