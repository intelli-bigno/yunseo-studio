import type { ReactNode } from "react";
import { Cormorant_Garamond, IBM_Plex_Mono, IBM_Plex_Sans_KR, Noto_Serif_KR } from "next/font/google";
import { cssText } from "@yunseo/design-tokens";
import { KeyNav, TopTools, type PaletteEntry } from "@/components/KeyNav";
import { Nav, type NavItem } from "@/components/Nav";
import { awaitingMe, blocked, queueState } from "@/lib/logic";
import { KIND_NO } from "@/lib/model";
import { PIECES, QUEUE, TODAY } from "@/lib/mock";
import { fmtDay, isoWeek } from "@/lib/format";
import "./globals.css";

// 서체: 전부 SIL OFL(무료). 빌드 시 받아 자체 호스팅된다 — 런타임 외부 요청 없음.
const display = Cormorant_Garamond({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-display", display: "swap" });
const serifKr = Noto_Serif_KR({ weight: ["500", "600"], variable: "--font-serif-kr", display: "swap", preload: false });
const sans = IBM_Plex_Sans_KR({ weight: ["400", "500", "600"], variable: "--font-sans", display: "swap", preload: false });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono", display: "swap" });

export const metadata = {
  title: "yunseo-studio",
  robots: { index: false, follow: false }, // 운영자 전용 화면 — 검색 노출 금지
};

const nav: NavItem[] = [
  { href: "/", label: "오늘", no: "01", count: awaitingMe(PIECES).length + blocked(PIECES).length },
  { href: "/schedule", label: "편성", no: "02" },
  { href: "/content", label: "콘텐츠", no: "03", count: PIECES.filter((p) => p.status !== "published").length },
  { href: "/publish", label: "발행", no: "04", count: QUEUE.filter((q) => queueState(q) === "ready").length },
  { href: "/performance", label: "성과", no: "05", disabled: true },
  { href: "/settings", label: "설정", no: "06", disabled: true },
];

const palette: PaletteEntry[] = [
  { href: "/", label: "오늘", tag: "화면", hint: "g t" },
  { href: "/schedule", label: "편성 캘린더", tag: "화면", hint: "g s" },
  { href: "/content", label: "콘텐츠", tag: "화면", hint: "g c" },
  { href: "/publish", label: "발행 대기열", tag: "화면", hint: "g p" },
  ...PIECES.map((p) => ({ href: `/content/${p.id}`, label: p.title, tag: KIND_NO[p.kind], hint: p.id })),
  ...PIECES.filter((p) => p.claims.length).map((p) => ({ href: `/content/${p.id}?tab=sources`, label: `출처·기준 시점 — ${p.title}`, tag: "G2", hint: p.id })),
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" className={`${display.variable} ${serifKr.variable} ${sans.variable} ${mono.variable}`}>
      <head>
        <style>{cssText()}</style>
      </head>
      <body>
        <div className="shell">
          <aside className="side">
            <div className="brand">
              <span className="brand-mark">Y</span>
              <span className="brand-text">
                <div className="brand-name">Yunseo Studio</div>
              </span>
            </div>
            <Nav items={nav} />
            <div className="side-foot">
              <span className="eyebrow">운영자 전용 · 목업 데이터</span>
              <span>
                <kbd className="kbd">?</kbd> 단축키
              </span>
            </div>
          </aside>
          <div className="main">
            <header className="top">
              <div className="crumbs">
                <b className="display" style={{ fontSize: 18 }}>{fmtDay(TODAY)}</b>
                <span className="mono">W{isoWeek(TODAY)}</span>
                <span>· 기준 시각 KST</span>
              </div>
              <TopTools />
            </header>
            {children}
          </div>
        </div>
        <KeyNav entries={palette} />
      </body>
    </html>
  );
}
