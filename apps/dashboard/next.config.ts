import type { NextConfig } from "next";
import { DEVICE_SIZES, IMAGE_QUALITY, IMAGE_SIZES } from "./src/lib/image-config";

// 운영 웹 화면 (docs/06-dashboard.md). 데이터는 유스케이스 → SQLite 어댑터(시안 데이터)에서 온다.
const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // workspace 패키지는 TS 원본을 내보낸다 — Next 가 함께 변환한다.
  transpilePackages: ["@yunseo/design-tokens", "@yunseo/ui", "@yunseo/domain", "@yunseo/application", "@yunseo/adapters-storage", "@yunseo/adapters-render-html", "@yunseo/presets-schema", "@yunseo/adapters-publisher-manual", "@yunseo/adapters-video"],
  // [L7] 카드 렌더(L1)는 네이티브 모듈(@resvg/resvg-js, .node 바이너리)과 satori(yoga wasm)를 쓴다 — 번들에 넣지 않고 Node 가 그대로 읽게 한다
  serverExternalPackages: ["@resvg/resvg-js", "satori"],
  // Windows 실행기 개발 등급은 작업당 프로세스·스레드 256 상한이다. Turbopack 빌드는 워커마다 네이티브 스레드를
  // 띄워 spawn EAGAIN 으로 죽어서(2026-11-04 실측) 빌드는 webpack(package.json) + 워커 2개로 한다. dev 는 Turbopack 그대로.
  experimental: { cpus: 2 },
  // 이미지 최적화(docs/09-performance.md §5): 원본(JPEG·PNG)을 화면 크기에 맞춰 WebP 로 줄여 내보낸다.
  // AVIF 는 쓰지 않는다 — 화면당 20KB 더 줄지만 변환 때 서버 메모리가 +145MB(RSS), 변환 시간이 4배(2026-11-04 실측)라 운영자 1~2명 도구에는 손해다.
  // 같은 입력은 디스크에 오래 캐시한다(minimumCacheTTL) — 카드 PNG 는 /api/cards 가 ETag 로 변경을 알린다.
  images: {
    formats: ["image/webp"],
    deviceSizes: DEVICE_SIZES, // 허용 폭·품질은 src/lib/image-config.ts 한 곳 — lib/media.ts 가 같은 값으로 주소를 만든다
    imageSizes: IMAGE_SIZES,
    qualities: [IMAGE_QUALITY],
    minimumCacheTTL: 60 * 60 * 24 * 30,
    localPatterns: [{ pathname: "/img/**" }, { pathname: "/api/cards/**" }],
  },
};

export default config;
