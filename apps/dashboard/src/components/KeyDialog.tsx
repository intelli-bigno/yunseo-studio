"use client";
// 빠른 이동(⌘K)·단축키 도움말 대화상자. 색인은 처음 열 때 /api/palette 에서 한 번 받고(60초 재사용),
// 결과가 많아도 가상 목록이라 화면에 보이는 행만 그린다.
import { useEffect, useMemo, useState } from "react";
import { CommandInput, CommandItem, Dialog, DialogBody, DialogHeader, EmptyState, Kbd, KeyHint, List, ListItem } from "@yunseo/ui";
import { VirtualList } from "@yunseo/ui/virtual";
import type { PaletteEntry } from "@/lib/palette";
import { SHORTCUTS } from "@/lib/shortcuts";

export type DialogMode = "none" | "palette" | "help";

const FRESH_MS = 60_000;
let memo: { at: number; entries: PaletteEntry[] } | null = null; // 모듈 하나 — 열 때마다 다시 받지 않는다

async function loadEntries(signal: AbortSignal): Promise<PaletteEntry[]> {
  if (memo && Date.now() - memo.at < FRESH_MS) return memo.entries;
  const res = await fetch("/api/palette", { signal });
  const entries = (await res.json()) as PaletteEntry[];
  memo = { at: Date.now(), entries };
  return entries;
}

export function KeyDialog({ mode, onClose, onGo, onPrefetch }: { mode: Exclude<DialogMode, "none">; onClose: () => void; onGo: (href: string) => void; onPrefetch: (href: string) => void }) {
  return (
    <Dialog onClose={onClose} label={mode === "palette" ? "빠른 이동" : "단축키"}>
      {mode === "palette" ? (
        <Palette onGo={onGo} onPrefetch={onPrefetch} />
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

function Palette({ onGo, onPrefetch }: { onGo: (href: string) => void; onPrefetch: (href: string) => void }) {
  const [entries, setEntries] = useState<PaletteEntry[] | null>(memo?.entries ?? null);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);

  useEffect(() => {
    const abort = new AbortController(); // 닫히면 받는 중이던 요청도 끊는다
    loadEntries(abort.signal)
      .then(setEntries)
      .catch(() => {
        /* 취소 또는 네트워크 실패 — 빈 목록으로 둔다 */
      });
    return () => abort.abort();
  }, []);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    const all = entries ?? [];
    return s ? all.filter((e) => `${e.label} ${e.tag} ${e.hint ?? ""}`.toLowerCase().includes(s)) : all;
  }, [q, entries]);

  // 고른 행으로 곧 이동할 가능성이 높다 — 그 화면을 미리 받아 둔다
  const target = results[sel]?.href;
  useEffect(() => {
    if (target) onPrefetch(target);
  }, [target, onPrefetch]);

  return (
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
            onGo(results[sel].href);
          }
        }}
      />
      {results.length === 0 ? (
        <EmptyState title={entries ? "없음" : "불러오는 중"} busy={!entries} />
      ) : (
        <VirtualList
          count={results.length}
          active={sel}
          label="빠른 이동 결과"
          renderRow={(i) => {
            const r = results[i]!;
            return (
              <CommandItem key={r.href + r.label} href={r.href} selected={i === sel} tag={r.tag} hint={r.hint} onMouseEnter={() => setSel(i)} onClick={(e) => { e.preventDefault(); onGo(r.href); }}>
                {r.label}
              </CommandItem>
            );
          }}
        />
      )}
    </>
  );
}
