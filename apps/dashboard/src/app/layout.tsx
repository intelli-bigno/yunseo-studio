import type { ReactNode } from "react";

export const metadata = {
  title: "yunseo-studio",
  robots: { index: false, follow: false }, // 운영자 전용 화면 — 검색 노출 금지
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
