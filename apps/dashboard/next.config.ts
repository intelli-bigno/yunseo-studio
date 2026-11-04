import type { NextConfig } from "next";

// 운영 웹 화면 (docs/06-dashboard.md). 목업 데이터로 핵심 화면이 동작한다 — 유스케이스 연결은 M2.
const config: NextConfig = {
  reactStrictMode: true,
  // workspace 패키지는 TS 원본을 내보낸다 — Next 가 함께 변환한다.
  transpilePackages: ["@yunseo/design-tokens", "@yunseo/ui"],
  // Windows 실행기 개발 등급은 작업당 프로세스·스레드 256 상한이다. Turbopack 빌드는 워커마다 네이티브 스레드를
  // 띄워 spawn EAGAIN 으로 죽어서(2026-11-04 실측) 빌드는 webpack(package.json) + 워커 2개로 한다. dev 는 Turbopack 그대로.
  experimental: { cpus: 2 },
};

export default config;
