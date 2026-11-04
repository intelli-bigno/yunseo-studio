"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { goTarget, SHORTCUTS } from "@/lib/shortcuts";

export interface PaletteEntry {
  href: string;
  label: string;
  tag: string;
  hint?: string;
}

function typing(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
}

export function KeyNav({ entries }: { entries: PaletteEntry[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<"none" | "palette" | "help">("none");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const pendingG = useRef<number>(0);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? entries.filter((e) => `${e.label} ${e.tag} ${e.hint ?? ""}`.toLowerCase().includes(s)) : entries;
  }, [q, entries]);

  useEffect(() => {
    const open = (m: "palette" | "help") => {
      setMode(m);
      setQ("");
      setSel(0);
    };
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
        if (href) router.push(href);
        return;
      }
      const now = Date.now();
      if (e.key === "g") {
        pendingG.current = now;
        return;
      }
      if (now - pendingG.current < 900) {
        pendingG.current = 0;
        const href = goTarget(e.key);
        if (href) router.push(href);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("ys:palette", onOpen);
      window.removeEventListener("ys:help", onHelp);
    };
  }, [router]);

  const go = (href: string) => {
    setMode("none");
    router.push(href);
  };

  if (mode === "none") return null;
  return (
    <div className="overlay" onMouseDown={() => setMode("none")}>
      <div className="dialog" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
        {mode === "palette" ? (
          <>
            <input
              autoFocus
              className="input"
              placeholder="편 · 화면 이름으로 이동…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setSel(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setSel((s) => Math.min(s + 1, results.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setSel((s) => Math.max(s - 1, 0));
                } else if (e.key === "Enter" && results[sel]) {
                  go(results[sel].href);
                }
              }}
            />
            <div className="palette-list" role="listbox">
              {results.map((r, i) => (
                <a key={r.href + r.label} href={r.href} aria-selected={i === sel} onMouseEnter={() => setSel(i)} onClick={(e) => { e.preventDefault(); go(r.href); }}>
                  <span className="mono mute">{r.tag}</span>
                  <span>{r.label}</span>
                  <span className="mute" style={{ fontSize: "var(--fs-xs)" }}>{r.hint}</span>
                </a>
              ))}
              {results.length === 0 && <div className="mute" style={{ padding: "12px 16px" }}>찾는 항목이 없습니다</div>}
            </div>
          </>
        ) : (
          <>
            <div className="dialog-head">
              <span className="h3">단축키</span>
              <span className="kbd">esc</span>
            </div>
            <div style={{ padding: "8px 16px 16px" }}>
              {SHORTCUTS.map((s) => (
                <div key={s.keys} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--c-line)" }}>
                  <span className="dim">{s.label}</span>
                  <span style={{ display: "flex", gap: 4 }}>
                    {s.keys.split(" ").map((k) => (
                      <kbd key={k} className="kbd">{k}</kbd>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function TopTools() {
  return (
    <div className="top-tools">
      <button className="btn btn-ghost" onClick={() => window.dispatchEvent(new Event("ys:palette"))}>
        빠른 이동 <kbd className="kbd">⌘</kbd>
        <kbd className="kbd">K</kbd>
      </button>
      <button className="btn btn-ghost" aria-label="단축키" onClick={() => window.dispatchEvent(new Event("ys:help"))}>
        <kbd className="kbd">?</kbd>
      </button>
    </div>
  );
}
