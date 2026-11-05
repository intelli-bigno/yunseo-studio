import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Windows 실행기 개발 등급은 작업당 프로세스·스레드 상한이 낮다 — 테스트 파일이 40개를 넘으면 기본(코어 수 - 1)만큼 포크를 한꺼번에 띄우다
    // "Timeout waiting for worker to respond" 로 임의의 파일이 시작하지 못했다(2026-11-05 실측, 같은 코드가 maxWorkers=4 로는 3회 모두 통과).
    maxWorkers: 4,
    // 카드 렌더(@resvg/resvg-js)는 Rust 스레드 풀(rayon)을 CPU 수만큼 만든다. 테스트 워커가 여러 개면 실행기의 작업당 스레드 상한(256)에서
    // 「OS can't spawn worker thread」로 워커가 죽는다(2026-11-05 실측) — 워커마다 풀을 작게 한다. 렌더 결과(바이트)에는 영향이 없다.
    env: { RAYON_NUM_THREADS: "2" },
    include: ["{apps,packages}/**/*.test.ts", "tests/**/*.test.ts"],
  },
});
