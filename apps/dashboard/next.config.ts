import type { NextConfig } from "next";

// 운영 웹 화면 (docs/06-dashboard.md). 목업 데이터로 핵심 화면이 동작한다 — 유스케이스 연결은 M2.
const config: NextConfig = {
  reactStrictMode: true,
  // workspace 패키지는 TS 원본을 내보낸다 — Next 가 함께 변환한다.
  transpilePackages: ["@yunseo/design-tokens"],
};

export default config;
