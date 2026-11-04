"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, CommandInput, CommandItem, CommandList, Dialog, DialogBody, DialogHeader, EmptyState, Kbd, KeyHint, List, ListItem, Stack } from "@yunseo/ui";
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
    <Dialog onClose={() => setMode("none")} label={mode === "palette" ? "빠른 이동" : "단축키"}>
      {mode === "palette" ? (
        <>
          <CommandInput
            autoFocus
            placeholder="편 · 화면 이름"
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
          <CommandList>
            {results.map((r, i) => (
              <CommandItem key={r.href + r.label} href={r.href} selected={i === sel} tag={r.tag} hint={r.hint} onMouseEnter={() => setSel(i)} onClick={(e) => { e.preventDefault(); go(r.href); }}>
                {r.label}
              </CommandItem>
            ))}
            {results.length === 0 && <EmptyState title="없음" />}
          </CommandList>
        </>
      ) : (
        <>
          <DialogHeader title="단축키" aside={<Kbd>esc</Kbd>} />
          <DialogBody>
            <List>
              {SHORTCUTS.map((s) => (
                <ListItem key={s.keys} title={s.label} trailing={<KeyHint keys={s.keys.split(" ")} />} />
              ))}
            </List>
          </DialogBody>
        </>
      )}
    </Dialog>
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
