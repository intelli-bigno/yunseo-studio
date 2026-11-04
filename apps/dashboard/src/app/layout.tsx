import type { ReactNode } from "react";
import { IBM_Plex_Mono, IBM_Plex_Sans_KR } from "next/font/google";
import { cssText } from "@yunseo/design-tokens";
import { Brand, Html, KeyHint, Shell, Sidebar, Text, TopBar } from "@yunseo/ui";
import { KeyNav, TopTools } from "@/components/KeyNav";
import { Nav, type NavEntry } from "@/components/Nav";
import { fmtDay } from "@/lib/format";
import { studio } from "@/server/studio";
import "@yunseo/ui/styles.css";

// 서체: 전부 SIL OFL(무료). 빌드 시 받아 자체 호스팅된다 — 런타임 외부 요청 없음. 제목·숫자는 Optima(시스템) 우선.
// 본문 서체(한글)는 글자 조각(unicode-range)별 파일이라 화면에 쓰인 글자의 조각만 받는다 — 미리 받기(preload)는 끈다.
// (2026-11-04 실측: preload 를 켜면 한글 조각 134개가 전부 <link rel=preload> 로 나가 HTML 이 4KB 늘고 모든 화면에서 약 1MB 를 먼저 받는다.)
// 굵기는 400·600 두 단계뿐이다(토큰 type.weight) — 500 은 쓰지 않으므로 싣지 않는다.
// 영문 서체는 조각이 라틴 하나뿐이라 미리 받는다 — 숫자·영문 코드가 모든 화면 첫 줄에 있다.
const sans = IBM_Plex_Sans_KR({ weight: ["400", "600"], variable: "--font-sans", display: "swap", preload: false });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "600"], variable: "--font-mono", display: "swap" });

export const metadata = {
  title: "yunseo-studio",
  robots: { index: false, follow: false }, // 운영자 전용 화면 — 검색 노출 금지
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const summary = await studio().getNavSummary();
  const nav: NavEntry[] = [
    { href: "/", label: "오늘", count: summary.awaiting + summary.stuck, alert: summary.stuck > 0 },
    { href: "/schedule", label: "편성" },
    { href: "/content", label: "콘텐츠", count: summary.unpublished },
    { href: "/publish", label: "발행", count: summary.ready },
    { href: "/performance", label: "성과", disabled: true },
    { href: "/settings", label: "설정", disabled: true },
  ];

  return (
    <Html fonts={[sans.variable, mono.variable]} head={<style>{cssText()}</style>}>
      <Shell
        sidebar={
          <Sidebar brand={<Brand mark="Y" name="Studio" />} foot={<KeyHint keys={["?"]} label="단축키" />}>
            <Nav items={nav} />
          </Sidebar>
        }
        top={
          <TopBar>
            <Text size="title">{fmtDay(summary.today)}</Text>
            <TopTools />
          </TopBar>
        }
      >
        {children}
      </Shell>
      <KeyNav />
    </Html>
  );
}
