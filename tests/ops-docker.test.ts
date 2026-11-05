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
const noComments = (src: string) => src.replace(/#.*$/gm, "");

const compose = read("compose.yaml");
const composeBody = noComments(compose);
const dockerfile = read("Dockerfile");
const entrypoint = read("ops/docker/entrypoint.sh");
const install = read("ops/docker/mac-tunnel/install.sh");

describe("compose — 노출 경계", () => {
  it("publish 하는 포트는 127.0.0.1 의 대시보드 8930 하나뿐이다(LAN·Tailnet·인터넷·워커 포트 없음)", () => {
    const ports = [...composeBody.matchAll(/^\s+- "([^"]*\d+:\d+(?:\/\w+)?)"$/gm)].map((m) => m[1]!);
    expect(ports).toEqual(["127.0.0.1:8930:8930"]);
  });

  it("서비스는 하나이고 네트워크를 다른 컨테이너와 공유하지 않는다(대시보드 재시작 때 워커가 끊기는 구성 금지)", () => {
    expect([...composeBody.matchAll(/^ {2}(\w[\w-]*):$/gm)].map((m) => m[1])).toEqual(["studio", "data"]);
    expect(composeBody).not.toMatch(/network_mode/);
  });

  it("워커는 컨테이너 안 루프백에만 바인드하고, 코드의 바인드 검사는 그대로다", () => {
    expect(entrypoint).toMatch(/start worker \S+ env HOST=127\.0\.0\.1 PORT=8931 /);
    expect(() => assertSafeHost("127.0.0.1")).not.toThrow();
    expect(() => assertSafeHost("0.0.0.0")).toThrow();
  });

  it("대시보드는 컨테이너 안에서 0.0.0.0:8930 으로 듣고, 헬스 확인이 둘을 모두 본다", () => {
    expect(entrypoint).toMatch(/start dashboard \S+ node \S+ start -H 0\.0\.0\.0 -p 8930/);
    expect(composeBody).toContain("http://127.0.0.1:8930/api/health");
    expect(composeBody).toContain("http://127.0.0.1:8931/health");
  });
});

describe("복귀·데이터", () => {
  it("unless-stopped, 하나가 죽으면 컨테이너째 재시작하도록 운명 공동체로 묶는다", () => {
    expect(composeBody).toMatch(/restart: unless-stopped/);
    expect(composeBody).toMatch(/init: true/);
    expect(entrypoint).toMatch(/wait -n /);
    expect(entrypoint).toMatch(/exit \$\(\(code == 0 \? 1 : code\)\)/); // 정상 종료(0)도 비정상으로 — 재시작 정책이 다시 올린다
    expect(dockerfile).toContain('CMD ["bash", "/app/ops/docker/entrypoint.sh"]');
  });

  it("SQLite 는 이름 있는 볼륨(/data)에 있고 볼륨 이름이 고정이다, /mnt/d(9p)는 쓰지 않는다", () => {
    expect(composeBody).toMatch(/STUDIO_DB: \/data\/studio\.db/);
    expect(composeBody).toMatch(/volumes:\n\s+- data:\/data/);
    expect(composeBody).toMatch(/^volumes:\n {2}data:\n {4}name: yunseo-studio-data$/m);
    expect(composeBody).not.toMatch(/\/mnt\/d/);
  });

  it("실제 운영 데이터 모드(STUDIO_CLOCK=system)와 KST", () => {
    expect(composeBody).toMatch(/STUDIO_CLOCK: system/);
    expect(composeBody).toMatch(/TZ: Asia\/Seoul/);
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
    for (const f of ["ops/docker/ctl.sh", "ops/docker/remote.sh", "ops/docker/entrypoint.sh", "ops/docker/mac-tunnel/install.sh"]) {
      expect(() => execFileSync("bash", ["-n", join(root, f)]), f).not.toThrow();
    }
  });
});
