"use client";
// 전역 키 입력과 상단 도구. 대화상자(빠른 이동·단축키 도움말)는 처음 열 때 내려받는다(KeyDialog) —
// 모든 화면이 대화상자·가상 목록 코드를 미리 싣지 않는다.
import { useRouter } from "next/navigation";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Button, Kbd, KeyHint, Stack } from "@yunseo/ui";
import { go as sceneGo, loadMotion, routerNavigate } from "@/lib/scene";
import { goTarget, SHORTCUTS } from "@/lib/shortcuts";
import type { DialogMode } from "./KeyDialog";

// next/dynamic 이 아니라 React.lazy — 같은 코드 분리인데 next/dynamic 은 런타임이 gzip 5KB 라 이 크기 코드에서는 분리 이득을 넘는다(실측)
const KeyDialog = lazy(() => import("./KeyDialog").then((m) => ({ default: m.KeyDialog })));

function typing(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
}

export function KeyNav() {
  const router = useRouter();
  const push = useCallback((href: string) => router.push(href), [router]);
  const [mode, setMode] = useState<DialogMode>("none");
  const pendingG = useRef<number>(0);
  const warmed = useRef(false);

  useEffect(() => {
    const open = (m: "palette" | "help") => setMode(m);
    const onOpen = () => open("palette");
    const onHelp = () => open("help");
    window.addEventListener("ys:palette", onOpen);
    window.addEventListener("ys:help", onHelp);
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        open("palette");
        return;
      }
      if (e.key === "Escape") {
        setMode("none");
        return;
      }
      if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "?") {
        open("help");
        return;
      }
      if (e.key === "[" || e.key === "]") {
        const el = document.querySelector<HTMLElement>("[data-tabs]");
        const href = el?.dataset[e.key === "[" ? "prev" : "next"];
        if (href) sceneGo(push, href);
        return;
      }
      const now = Date.now();
      if (e.key === "g") {
        pendingG.current = now;
        // 「g」 다음에 거의 확실히 이동 키가 온다 — 이동 후보 화면을 이 틈에 미리 받아 둔다(한 번만)
        if (!warmed.current) {
          warmed.current = true;
          for (const s of SHORTCUTS) if (s.href) router.prefetch(s.href);
        }
        return;
      }
      if (now - pendingG.current < 900) {
        pendingG.current = 0;
        const href = goTarget(e.key);
        if (href) sceneGo(push, href);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("ys:palette", onOpen);
      window.removeEventListener("ys:help", onHelp);
    };
  }, [router, push]);

  // 화면 전환·누름 물결 — 첫 화면이 다 그려지고 브라우저가 한가할 때 모션 코드를 받아 켠다
  useEffect(() => {
    let off: (() => void) | null = null;
    let cancelled = false;
    const start = () =>
      void loadMotion().then((m) => {
        if (!cancelled) off = m.installMotion(routerNavigate(push));
      });
    let idle = 0;
    if (window.requestIdleCallback) idle = window.requestIdleCallback(start, { timeout: 2000 });
    else start();
    return () => {
      cancelled = true;
      if (idle && window.cancelIdleCallback) window.cancelIdleCallback(idle);
      off?.();
    };
  }, [push]);

  const close = useCallback(() => setMode("none"), []);
  const go = useCallback(
    (href: string) => {
      setMode("none");
      sceneGo(push, href);
    },
    [router],
  );
  const prefetch = useCallback((href: string) => router.prefetch(href), [router]);

  return mode === "none" ? null : (
    <Suspense fallback={null}>
      <KeyDialog mode={mode} onClose={close} onGo={go} onPrefetch={prefetch} />
    </Suspense>
  );
}

export function TopTools() {
  return (
    <Stack direction="row" gap={2} align="center">
      <Button variant="ghost" onClick={() => window.dispatchEvent(new Event("ys:palette"))}>
        빠른 이동 <KeyHint keys={["⌘", "K"]} />
      </Button>
      <Button variant="ghost" aria-label="단축키" onClick={() => window.dispatchEvent(new Event("ys:help"))}>
        <Kbd>?</Kbd>
      </Button>
    </Stack>
  );
}
