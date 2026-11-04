import type { ReactNode } from "react";
import { IBM_Plex_Mono, IBM_Plex_Sans_KR } from "next/font/google";
import { cssText } from "@yunseo/design-tokens";
import { Brand, Html, KeyHint, Shell, Sidebar, Text, TopBar } from "@yunseo/ui";
import { KeyNav, TopTools, type PaletteEntry } from "@/components/KeyNav";
import { Nav, type NavEntry } from "@/components/Nav";
import { awaitingMe, blocked, queueState } from "@/lib/logic";
import { KIND_LABEL } from "@/lib/model";
import { PIECES, QUEUE, TODAY } from "@/lib/mock";
import { fmtDay } from "@/lib/format";
import "@yunseo/ui/styles.css";

// 서체: 전부 SIL OFL(무료). 빌드 시 받아 자체 호스팅된다 — 런타임 외부 요청 없음. 제목·숫자는 Optima(시스템) 우선.
const sans = IBM_Plex_Sans_KR({ weight: ["400", "500", "600"], variable: "--font-sans", display: "swap", preload: false });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono", display: "swap" });

export const metadata = {
  title: "yunseo-studio",
  robots: { index: false, follow: false }, // 운영자 전용 화면 — 검색 노출 금지
};

const stuck = blocked(PIECES).length;
const nav: NavEntry[] = [
  { href: "/", label: "오늘", count: awaitingMe(PIECES).length + stuck, alert: stuck > 0 },
  { href: "/schedule", label: "편성" },
  { href: "/content", label: "콘텐츠", count: PIECES.filter((p) => p.status !== "published").length },
  { href: "/publish", label: "발행", count: QUEUE.filter((q) => queueState(q) === "ready").length },
  { href: "/performance", label: "성과", disabled: true },
  { href: "/settings", label: "설정", disabled: true },
];

const palette: PaletteEntry[] = [
  { href: "/", label: "오늘", tag: "화면", hint: "g t" },
  { href: "/schedule", label: "편성", tag: "화면", hint: "g s" },
  { href: "/content", label: "콘텐츠", tag: "화면", hint: "g c" },
  { href: "/publish", label: "발행", tag: "화면", hint: "g p" },
  ...PIECES.map((p) => ({ href: `/content/${p.id}`, label: p.title, tag: KIND_LABEL[p.kind], hint: p.id })),
  ...PIECES.filter((p) => p.claims.length).map((p) => ({ href: `/content/${p.id}?tab=sources`, label: `출처 — ${p.title}`, tag: "G2", hint: p.id })),
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <Html fonts={[sans.variable, mono.variable]} head={<style>{cssText()}</style>}>
        <Shell
          sidebar={<Sidebar brand={<Brand mark="Y" name="Studio" />} foot={<KeyHint keys={["?"]} label="단축키" />}>
            <Nav items={nav} />
          </Sidebar>}
          top={
            <TopBar>
              <Text size="title">{fmtDay(TODAY)}</Text>
              <TopTools />
            </TopBar>
          }
        >
          {children}
        </Shell>
        <KeyNav entries={palette} />
    </Html>
  );
}
