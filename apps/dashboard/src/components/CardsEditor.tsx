"use client";
// [cards] 카드뉴스 편집기 — 들어오자마자 새 덱 캔버스(저장 전 초안, revision 0). 「저장」을 처음 누를 때 덱을 만들고(POST) 이어서 저장(PUT)한다.
// 덱(여러 장) · 캔버스(이미지·텍스트·덮개·스티커 레이어 + 덱 워터마크) · 오른쪽 패널(추가·레이어·속성·워터마크).
// 실행취소/다시실행은 덱 스냅숏 스택(같은 칸 연속 입력·한 번의 끌기는 한 단계로 묶는다). 옮길 때 카드 가장자리·가운데·다른 레이어에 붙는다(Alt 로 끔).
import { useCallback, useEffect, useRef, useState, type DragEvent, type PointerEvent, type ReactNode } from "react";
import {
  CARD_FONTS,
  CARD_PRESETS,
  CARD_WEIGHTS,
  STICKER_LIBRARY,
  STICKER_SHAPES,
  WATERMARK_POSITIONS,
  addCard,
  addLayer,
  createDeck,
  defaultWatermark,
  dragBox,
  duplicateCard,
  duplicateLayer,
  imageLayer,
  moveCard,
  moveLayer,
  moveLayerToEdge,
  overlayLayer,
  removeCard,
  removeLayer,
  snapBox,
  stickerDataUrl,
  stickerLayer,
  textLayer,
  toggleLayerHidden,
  toggleLayerLocked,
  updateCard,
  updateLayer,
  type CardDeck,
  type CardFont,
  type CardLayer,
  type CardPresetId,
  type DeckCard,
  type DragMode,
  type StickerShape,
  type Watermark,
  type WatermarkPosition,
} from "@yunseo/domain";
import {
  AssetGrid,
  AssetTile,
  Button,
  CanvasGuides,
  Card,
  CardHeader,
  ColorField,
  DeckStrip,
  DeckThumb,
  EditorLayout,
  EmptyState,
  Field,
  FieldRow,
  IconButton,
  Input,
  LayerRow,
  Notice,
  Range,
  Segmented,
  SegmentedItem,
  Select,
  Stack,
  StickerGrid,
  StickerTile,
  Text,
  Textarea,
} from "@yunseo/ui";
import { drawCard, exportName, type Ctx2D, type LoadedImage } from "@/lib/cards-export";
import { CardView, cssFamily } from "./CardView";

export interface EditorAsset {
  id: string;
  group: "generated" | "reference";
  src: string;
  label: string;
}
export interface DeckSummary {
  id: string;
  title: string;
  preset: CardPresetId;
  cardCount: number;
  revision: number;
  updatedAt: string;
}
interface Loaded {
  deck: CardDeck;
  /** 0 = 아직 저장 안 한 초안 */
  revision: number;
}

const DND_ASSET = "text/x-cards-asset";
const DND_STICKER = "text/x-cards-sticker";
const FONT_LABEL: Record<CardFont, string> = { sans: "고딕(본문 서체)", serif: "명조", mono: "고정폭" };
const KIND_LABEL: Record<CardLayer["kind"], string> = { image: "IMG", text: "TXT", overlay: "DIM", sticker: "STK" };
const SHAPE_LABEL: Record<StickerShape, string> = { rect: "사각형", circle: "원", arrow: "화살표", bubble: "말풍선", badge: "배지", star: "별", emoji: "이모지" };
const POS_LABEL: Record<WatermarkPosition, string> = { tl: "↖", tc: "↑", tr: "↗", ml: "←", mc: "·", mr: "→", bl: "↙", bc: "↓", br: "↘" };
const PRESET_IDS = Object.keys(CARD_PRESETS) as CardPresetId[];

/** 캔버스 글자 서체 — CSS 변수를 실제 이름으로 푼다 */
function canvasFamily(f: CardFont): string {
  if (f === "serif") return cssFamily(f);
  const v = getComputedStyle(document.body).getPropertyValue(f === "sans" ? "--font-sans" : "--font-mono").trim();
  return `${v || (f === "sans" ? "sans-serif" : "monospace")}, ${f === "sans" ? "sans-serif" : "monospace"}`;
}

let seq = 0;
const newId = () => `l${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const draft = (preset: CardPresetId = "4:5"): Loaded => ({ deck: createDeck(newId(), "새 카드뉴스", preset, newId()), revision: 0 });

function loadImage(src: string): Promise<LoadedImage | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ img, width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function cardPng(card: DeckCard, deck: CardDeck): Promise<Blob | null> {
  const { width, height } = CARD_PRESETS[deck.preset];
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  await document.fonts.ready;
  // drawImage 겹침 선언(overload) 때문에 구조 대입이 안 된다 — 쓰는 부분만 같은 Ctx2D 로 본다
  await drawCard(ctx as unknown as Ctx2D, card, deck.preset, { load: loadImage, family: canvasFamily }, deck.watermark);
  return new Promise((r) => canvas.toBlob(r, "image/png"));
}

// 내려받기 뒤 주소 거두기·연속 내려받기 간격 — 화면을 떠나면 남은 타이머를 모두 거둔다
const timers = new Set<ReturnType<typeof setTimeout>>();
const later = (ms: number, fn: () => void = () => {}) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(() => (timers.delete(t), fn(), resolve()), ms);
    timers.add(t);
  });
const clearTimers = () => {
  for (const t of timers) clearTimeout(t);
  timers.clear();
};

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  void later(1000, () => URL.revokeObjectURL(url));
}

/** 같은 출처 덱 API 만 부른다(path 는 "" 또는 "/<id>") — 30초 넘으면 끊는다 */
async function api<T>(path: string, init?: RequestInit): Promise<{ status: number; body: T }> {
  const res = await fetch(`/api/cards-decks${path}`, { ...init, signal: AbortSignal.timeout(30_000), headers: { "content-type": "application/json", ...init?.headers } });
  return { status: res.status, body: res.status === 204 ? (null as T) : ((await res.json().catch(() => null)) as T) };
}

/** 숫자 칸 — 범위 밖·빈 값은 무시 */
function Num({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  return (
    <Field label={label}>
      <Input type="number" mono value={Math.round(value * 100) / 100} min={min} max={max} step={step} onChange={(e) => { const v = Number(e.target.value); if (e.target.value !== "" && Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v))); }} />
    </Field>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} />
      <Stack gap={4}>{children}</Stack>
    </Card>
  );
}

export function CardsEditor({ initialDecks, initial, assets }: { initialDecks: DeckSummary[]; initial: Loaded | null; assets: EditorAsset[] }) {
  const [decks, setDecks] = useState(initialDecks);
  const [cur, setCur] = useState<Loaded>(() => initial ?? draft());
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "alert" | "accent"; text: string } | null>(null);
  const [assetTab, setAssetTab] = useState<EditorAsset["group"]>("generated");
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });
  const [, setHistTick] = useState(0);
  const hist = useRef<{ past: CardDeck[]; future: CardDeck[]; key: string; at: number }>({ past: [], future: [], key: "", at: 0 });
  const deckRef = useRef(cur.deck);
  deckRef.current = cur.deck;
  const drag = useRef<{ id: string; mode: DragMode; sx: number; sy: number; scale: number; start: { x: number; y: number; w: number; h: number }; keep: boolean; key: string } | null>(null);

  const deck = cur.deck;
  const card = deck.cards[Math.min(index, deck.cards.length - 1)]!;
  const layer = card.layers.find((l) => l.id === selected) ?? null;

  /** 덱 고치기 — 실행취소 스택에 남기고 저장 안 됨 표시. key 가 같고 1초 안이면 한 단계로 묶는다 */
  const edit = useCallback((fn: (d: CardDeck) => CardDeck, key = "") => {
    const h = hist.current;
    const now = Date.now();
    const prev = deckRef.current;
    const next = fn(prev);
    if (next === prev) return;
    if (!(key && key === h.key && now - h.at < 1000)) {
      h.past.push(prev);
      if (h.past.length > 100) h.past.shift();
    }
    h.future = [];
    h.key = key;
    h.at = now;
    deckRef.current = next;
    setCur((c) => ({ ...c, deck: next }));
    setDirty(true);
    setHistTick((t) => t + 1);
  }, []);
  const editCard = useCallback((fn: (c: DeckCard) => DeckCard, key = "") => edit((d) => updateCard(d, Math.min(index, d.cards.length - 1), fn), key), [edit, index]);

  const undo = useCallback(() => {
    const h = hist.current;
    const prev = h.past.pop();
    if (!prev) return;
    h.future.push(deckRef.current);
    h.key = "";
    deckRef.current = prev;
    setCur((c) => ({ ...c, deck: prev }));
    setDirty(true);
    setHistTick((t) => t + 1);
  }, []);
  const redo = useCallback(() => {
    const h = hist.current;
    const next = h.future.pop();
    if (!next) return;
    h.past.push(deckRef.current);
    h.key = "";
    deckRef.current = next;
    setCur((c) => ({ ...c, deck: next }));
    setDirty(true);
    setHistTick((t) => t + 1);
  }, []);
  const resetHistory = () => {
    hist.current = { past: [], future: [], key: "", at: 0 };
    setHistTick((t) => t + 1);
  };

  useEffect(() => clearTimers, []);

  // 저장 안 한 채 떠나면 묻는다
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  // 단축키 — 입력칸 밖에서: Delete/Backspace 삭제, ⌘/Ctrl+Z 실행취소, ⇧⌘Z·Ctrl+Y 다시실행, ⌘/Ctrl+D 복제
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.closest("input, textarea, select, [contenteditable]") || t.isContentEditable)) return;
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if (mod && k === "z") return e.preventDefault(), e.shiftKey ? redo() : undo();
      if (mod && k === "y") return e.preventDefault(), redo();
      if (!selected) return;
      if (mod && k === "d") {
        e.preventDefault();
        const id = newId();
        editCard((c) => duplicateLayer(c, selected, id));
        return setSelected(id);
      }
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      e.preventDefault();
      editCard((c) => removeLayer(c, selected));
      setSelected(null);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [selected, editCard, undo, redo]);

  // ── 끌기(이동·크기) — 잠긴 레이어는 고르기만 ──
  const startDrag = (l: CardLayer, mode: DragMode, e: PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    setSelected(l.id);
    if (l.locked) return;
    const stage = (e.currentTarget as HTMLElement).closest("[data-canvas-stage]");
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const preset = deck.preset;
    const others = card.layers.filter((o) => o.id !== l.id && !o.hidden);
    drag.current = { id: l.id, mode, sx: e.clientX, sy: e.clientY, scale: CARD_PRESETS[preset].width / rect.width, start: { x: l.x, y: l.y, w: l.w, h: l.h }, keep: l.kind === "image" || l.kind === "sticker", key: `drag:${newId()}` };
    const move = (ev: globalThis.PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      let box = dragBox(d.start, d.mode, (ev.clientX - d.sx) * d.scale, (ev.clientY - d.sy) * d.scale, preset, d.keep !== ev.shiftKey);
      if (d.mode === "move" && !ev.altKey) {
        const s = snapBox(box, others, preset, 12);
        box = s.box;
        setGuides(s.guides);
      } else setGuides({ v: [], h: [] });
      editCard((c) => updateLayer(c, d.id, box), d.key);
    };
    const up = () => {
      drag.current = null;
      setGuides({ v: [], h: [] });
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // ── 넣기(자산·스티커 — 끌어 놓기·누르기) ──
  const put = (l: CardLayer) => {
    editCard((c) => addLayer(c, l));
    setSelected(l.id);
  };
  const addAsset = async (a: EditorAsset, at?: { cx: number; cy: number }) => {
    const img = await loadImage(a.src);
    put(imageLayer(newId(), deck.preset, a.src, { name: a.label, aspect: img ? img.width / img.height : undefined, scale: 1, ...at }));
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const { width, height } = CARD_PRESETS[deck.preset];
    const at = { cx: ((e.clientX - rect.left) / rect.width) * width, cy: ((e.clientY - rect.top) / rect.height) * height };
    const sid = e.dataTransfer.getData(DND_STICKER);
    if (sid) return put(stickerLayer(newId(), deck.preset, sid, at));
    const a = assets.find((x) => x.id === e.dataTransfer.getData(DND_ASSET));
    if (a) void addAsset(a, at);
  };

  // ── 덱 새로·열기·저장·삭제 ──
  const reset = (next: Loaded) => {
    setCur(next);
    deckRef.current = next.deck;
    setIndex(0);
    setSelected(null);
    setDirty(false);
    resetHistory();
  };
  const fresh = () => {
    if (dirty && !confirm("저장하지 않은 변경이 있습니다. 버리고 새로 만들까요?")) return;
    reset(draft(deck.preset));
    setMsg(null);
  };
  const open = async (id: string) => {
    if (!id) return;
    if (dirty && !confirm("저장하지 않은 변경이 있습니다. 버리고 열까요?")) return;
    setBusy(true);
    const r = await api<Loaded>(`/${id}`);
    setBusy(false);
    if (r.status !== 200) return setMsg({ tone: "alert", text: "덱을 불러오지 못했습니다" });
    reset({ deck: r.body.deck, revision: r.body.revision });
    setMsg(null);
  };
  const save = async () => {
    setBusy(true);
    try {
      let { deck: d, revision } = cur;
      if (revision === 0) {
        // 첫 저장 — 서버가 덱 id 를 정한다
        const c = await api<Loaded>("", { method: "POST", body: JSON.stringify({ title: d.title, preset: d.preset }) });
        if (c.status !== 201) return setMsg({ tone: "alert", text: "새 덱을 만들지 못했습니다" });
        d = { ...d, id: c.body.deck.id };
        revision = c.body.revision;
        setCur({ deck: d, revision });
      }
      const r = await api<Loaded & { errors?: string[] }>(`/${d.id}`, { method: "PUT", body: JSON.stringify({ deck: d, revision }) });
      if (r.status === 200) {
        setCur({ deck: r.body.deck, revision: r.body.revision });
        deckRef.current = r.body.deck;
        setDirty(false);
        setDecks((ds) => [{ id: r.body.deck.id, title: r.body.deck.title, preset: r.body.deck.preset, cardCount: r.body.deck.cards.length, revision: r.body.revision, updatedAt: new Date().toISOString() }, ...ds.filter((x) => x.id !== r.body.deck.id)]);
        return setMsg({ tone: "accent", text: "저장했습니다 — 콘텐츠 탭 맨 앞에 보입니다" });
      }
      if (r.status === 409) return setMsg({ tone: "alert", text: "다른 곳에서 먼저 저장했습니다 — 덱을 다시 불러온 뒤 고쳐 주세요" });
      setMsg({ tone: "alert", text: `저장하지 못했습니다${r.body?.errors ? ` — ${r.body.errors.slice(0, 3).join(", ")}` : ""}` });
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (cur.revision === 0) return fresh();
    if (!confirm(`「${deck.title}」 덱을 지울까요? 되돌릴 수 없습니다.`)) return;
    const r = await api(`/${deck.id}`, { method: "DELETE" });
    if (r.status !== 204) return setMsg({ tone: "alert", text: "지우지 못했습니다" });
    setDecks((ds) => ds.filter((d) => d.id !== deck.id));
    reset(draft(deck.preset));
  };

  // ── PNG ──
  const exportCards = async (which: number[]) => {
    setBusy(true);
    try {
      for (const i of which) {
        const blob = await cardPng(deck.cards[i]!, deck);
        if (!blob) throw new Error("캔버스");
        download(blob, exportName(deck.title, i));
        await later(250); // 브라우저가 연속 내려받기를 막지 않게
      }
      setMsg({ tone: "accent", text: `PNG ${which.length}장을 내려받았습니다` });
    } catch {
      setMsg({ tone: "alert", text: "PNG 를 만들지 못했습니다" });
    } finally {
      setBusy(false);
    }
  };

  const { width: cw, height: ch } = CARD_PRESETS[deck.preset];
  const at = Math.min(index, deck.cards.length - 1);
  const layersTop = [...card.layers].reverse();
  const shown = assets.filter((a) => a.group === assetTab);
  const setL = (patch: Partial<CardLayer>, key?: string) => layer && editCard((c) => updateLayer(c, layer.id, patch), key ?? `layer:${layer.id}:${Object.keys(patch).join(",")}`);
  const wm = deck.watermark;
  const setWm = (patch: Partial<Watermark>) => edit((d) => ({ ...d, watermark: d.watermark ? { ...d.watermark, ...patch } : null }), `wm:${Object.keys(patch).join(",")}`);
  const h = hist.current;

  return (
    <Stack gap={5}>
      <Stack direction="row" gap={3} wrap align="center">
        <Input aria-label="덱 제목" value={deck.title} maxLength={80} onChange={(e) => edit((d) => ({ ...d, title: e.target.value }), "title")} />
        <Select aria-label="카드 규격" value={deck.preset} onChange={(e) => edit((d) => ({ ...d, preset: e.target.value as CardPresetId }))}>
          {PRESET_IDS.map((p) => (
            <option key={p} value={p}>
              {CARD_PRESETS[p].label}
            </option>
          ))}
        </Select>
        <Text tone="mute">
          {deck.cards.length}장{cur.revision === 0 ? " · 새 덱(저장 전)" : ""}
          {dirty ? " · 저장 안 됨" : ""}
        </Text>
        <Button variant="secondary" onClick={undo} disabled={!h.past.length} title="실행취소 (⌘Z)">
          실행취소
        </Button>
        <Button variant="secondary" onClick={redo} disabled={!h.future.length} title="다시실행 (⇧⌘Z)">
          다시실행
        </Button>
        <Button variant="primary" onClick={save} disabled={busy || (!dirty && cur.revision > 0)}>
          저장
        </Button>
        <Button variant="secondary" onClick={() => exportCards([at])} disabled={busy}>
          이 장 PNG
        </Button>
        <Button variant="secondary" onClick={() => exportCards(deck.cards.map((_, i) => i))} disabled={busy}>
          전체 PNG
        </Button>
        <Button variant="secondary" onClick={fresh} disabled={busy}>
          새 덱
        </Button>
        <Select aria-label="저장된 덱 열기" value="" onChange={(e) => void open(e.target.value)} disabled={busy || decks.length === 0}>
          <option value="">{decks.length ? `저장된 덱 열기(${decks.length})` : "저장된 덱 없음"}</option>
          {decks.map((d) => (
            <option key={d.id} value={d.id}>
              {d.title} · {d.cardCount}장 · {d.updatedAt.slice(0, 16).replace("T", " ")}
            </option>
          ))}
        </Select>
        <Button variant="secondary" onClick={remove} disabled={busy}>
          덱 삭제
        </Button>
      </Stack>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <EditorLayout
        deck={
          <>
            <DeckStrip label="카드 순서">
              {deck.cards.map((c, i) => (
                <DeckThumb key={c.id} index={i} current={i === at} label={`${i + 1}번째 장`} onClick={() => (setIndex(i), setSelected(null))}>
                  <CardView card={c} preset={deck.preset} watermark={wm} mini />
                </DeckThumb>
              ))}
            </DeckStrip>
            <Stack gap={2}>
              <Button variant="secondary" onClick={() => (edit((d) => addCard(d, newId(), at)), setIndex(at + 1), setSelected(null))}>
                장 추가
              </Button>
              <Button variant="secondary" onClick={() => (edit((d) => duplicateCard(d, at, newId)), setIndex(at + 1), setSelected(null))}>
                장 복제
              </Button>
              <Button variant="secondary" title="이 장을 앞으로 한 칸" disabled={at === 0} onClick={() => (edit((d) => moveCard(d, at, -1)), setIndex(at - 1))}>
                ↑ 앞으로
              </Button>
              <Button variant="secondary" title="이 장을 뒤로 한 칸" disabled={at === deck.cards.length - 1} onClick={() => (edit((d) => moveCard(d, at, 1)), setIndex(at + 1))}>
                ↓ 뒤로
              </Button>
              <Button variant="secondary" title="이 장 삭제" disabled={deck.cards.length <= 1} onClick={() => confirm(`${at + 1}번째 장을 지울까요?`) && (edit((d) => removeCard(d, at)), setIndex(Math.max(0, at - 1)), setSelected(null))}>
                × 장 삭제
              </Button>
            </Stack>
          </>
        }
        stage={
          <>
            <CardView card={card} preset={deck.preset} watermark={wm} selected={selected} onLayerDown={(l, e) => startDrag(l, "move", e)} onHandleDown={(l, m, e) => startDrag(l, m, e)} onDrop={onDrop}>
              <CanvasGuides v={guides.v} h={guides.h} cw={cw} ch={ch} />
            </CardView>
            <Stack direction="row" gap={2} wrap>
              <Button variant="secondary" onClick={() => put(textLayer(newId(), deck.preset))}>
                + 텍스트
              </Button>
              <Button variant="secondary" onClick={() => put(overlayLayer(newId(), deck.preset))}>
                + 덮개
              </Button>
              <Button variant="secondary" onClick={() => setSelected(null)} disabled={!selected}>
                선택 해제
              </Button>
            </Stack>
            <Text tone="mute">
              {cw}×{ch} · 끌어 옮기면 가장자리·가운데·다른 레이어에 붙음(Alt 로 끔) · 모서리로 크기(이미지·스티커는 비율 유지, Shift 로 해제) · Delete 삭제 · ⌘D 복제 · ⌘Z 실행취소
            </Text>
          </>
        }
        panel={
          <>
            <Section title="스티커">
              <StickerGrid>
                {STICKER_LIBRARY.map((s) => (
                  <StickerTile
                    key={s.id}
                    label={s.label}
                    src={stickerDataUrl({ shape: s.shape, fill: s.fill, label: s.text, labelColor: s.labelColor, w: 120, h: Math.round(120 / s.aspect) })}
                    onDragStart={(e) => (e.dataTransfer.setData(DND_STICKER, s.id), (e.dataTransfer.effectAllowed = "copy"))}
                    onClick={() => put(stickerLayer(newId(), deck.preset, s.id))}
                  />
                ))}
              </StickerGrid>
            </Section>
            <Section title="자산">
              <Segmented label="자산 종류">
                <SegmentedItem current={assetTab === "generated"} onClick={() => setAssetTab("generated")}>
                  생성 이미지
                </SegmentedItem>
                <SegmentedItem current={assetTab === "reference"} onClick={() => setAssetTab("reference")}>
                  레퍼런스
                </SegmentedItem>
              </Segmented>
              {shown.length === 0 ? (
                <EmptyState title="자산이 없습니다" />
              ) : (
                <AssetGrid>
                  {shown.map((a) => (
                    <AssetTile key={a.id} src={a.src} label={a.label} onDragStart={(e) => (e.dataTransfer.setData(DND_ASSET, a.id), (e.dataTransfer.effectAllowed = "copy"))} onClick={() => addAsset(a)} />
                  ))}
                </AssetGrid>
              )}
            </Section>
            <Section title="레이어">
              {layersTop.length === 0 ? (
                <EmptyState title="레이어가 없습니다" />
              ) : (
                <div role="list" aria-label="레이어(위가 앞)">
                  {layersTop.map((l) => (
                    <LayerRow
                      key={l.id}
                      name={l.name}
                      kind={KIND_LABEL[l.kind]}
                      selected={l.id === selected}
                      hidden={l.hidden}
                      onSelect={() => setSelected(l.id)}
                      actions={
                        <>
                          <IconButton label="한 칸 앞으로" disabled={l.id === card.layers.at(-1)?.id} onClick={() => editCard((c) => moveLayer(c, l.id, 1))}>
                            ↑
                          </IconButton>
                          <IconButton label="한 칸 뒤로" disabled={l.id === card.layers[0]?.id} onClick={() => editCard((c) => moveLayer(c, l.id, -1))}>
                            ↓
                          </IconButton>
                          <IconButton label={l.locked ? "잠금 풀기" : "잠그기"} onClick={() => editCard((c) => toggleLayerLocked(c, l.id))}>
                            {l.locked ? "🔒" : "🔓"}
                          </IconButton>
                          <IconButton label={l.hidden ? "보이기" : "숨기기"} onClick={() => editCard((c) => toggleLayerHidden(c, l.id))}>
                            {l.hidden ? "◌" : "●"}
                          </IconButton>
                          <IconButton label="복제" onClick={() => { const id = newId(); editCard((c) => duplicateLayer(c, l.id, id)); setSelected(id); }}>
                            ⧉
                          </IconButton>
                          <IconButton label="삭제" onClick={() => (editCard((c) => removeLayer(c, l.id)), l.id === selected && setSelected(null))}>
                            ×
                          </IconButton>
                        </>
                      }
                    />
                  ))}
                </div>
              )}
            </Section>
            <Section title={layer ? `속성 — ${layer.name}` : "카드 속성"}>
              {!layer && <ColorField label="바탕색" value={card.background} onChange={(v) => editCard((c) => ({ ...c, background: v }), "bg")} />}
              {layer && (
                <>
                  <Field label="이름">
                    <Input value={layer.name} maxLength={40} onChange={(e) => setL({ name: e.target.value })} />
                  </Field>
                  <Stack direction="row" gap={2} wrap>
                    <Button variant="secondary" onClick={() => editCard((c) => moveLayerToEdge(c, layer.id, 1))}>맨 앞으로</Button>
                    <Button variant="secondary" onClick={() => editCard((c) => moveLayerToEdge(c, layer.id, -1))}>맨 뒤로</Button>
                    <Button variant="secondary" onClick={() => editCard((c) => toggleLayerLocked(c, layer.id))}>{layer.locked ? "잠금 풀기" : "잠그기"}</Button>
                    <Button variant="secondary" onClick={() => { const id = newId(); editCard((c) => duplicateLayer(c, layer.id, id)); setSelected(id); }}>복제</Button>
                    <Button variant="secondary" onClick={() => (editCard((c) => removeLayer(c, layer.id)), setSelected(null))}>삭제</Button>
                  </Stack>
                  <FieldRow>
                    <Num label="X" value={layer.x} min={-5000} max={5000} onChange={(v) => setL({ x: v })} />
                    <Num label="Y" value={layer.y} min={-5000} max={5000} onChange={(v) => setL({ y: v })} />
                    <Num label="W" value={layer.w} min={24} max={5000} onChange={(v) => setL({ w: v })} />
                    <Num label="H" value={layer.h} min={24} max={5000} onChange={(v) => setL({ h: v })} />
                  </FieldRow>
                  <Range label="회전" value={layer.rotation} min={-180} max={180} step={1} display={`${layer.rotation}°`} onChange={(v) => setL({ rotation: v })} />
                </>
              )}
              {layer?.kind === "text" && (
                <>
                  <Field label="내용">
                    <Textarea value={layer.text} maxLength={2000} onChange={(e) => setL({ text: e.target.value })} />
                  </Field>
                  <FieldRow>
                    <Field label="서체">
                      <Select value={layer.font} onChange={(e) => setL({ font: e.target.value as CardFont })}>
                        {CARD_FONTS.map((f) => (
                          <option key={f} value={f}>
                            {FONT_LABEL[f]}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="굵기">
                      <Select value={layer.weight} onChange={(e) => setL({ weight: Number(e.target.value) as (typeof CARD_WEIGHTS)[number] })}>
                        {CARD_WEIGHTS.map((w) => (
                          <option key={w} value={w}>
                            {w}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </FieldRow>
                  <FieldRow>
                    <Num label="크기" value={layer.size} min={12} max={400} onChange={(v) => setL({ size: v })} />
                    <Num label="자간" value={layer.letterSpacing} min={-50} max={200} onChange={(v) => setL({ letterSpacing: v })} />
                    <Num label="행간" value={layer.lineHeight} min={0.8} max={3} step={0.05} onChange={(v) => setL({ lineHeight: v })} />
                  </FieldRow>
                  <Range label="크기" value={layer.size} min={12} max={400} step={1} display={`${layer.size}px`} onChange={(v) => setL({ size: v })} />
                  <ColorField label="글자 색" value={layer.color} onChange={(v) => setL({ color: v })} />
                  <Segmented label="가로 정렬">
                    {(["left", "center", "right"] as const).map((a) => (
                      <SegmentedItem key={a} current={layer.align === a} onClick={() => setL({ align: a })}>
                        {a === "left" ? "왼쪽" : a === "center" ? "가운데" : "오른쪽"}
                      </SegmentedItem>
                    ))}
                  </Segmented>
                  <Segmented label="세로 정렬">
                    {(["top", "middle", "bottom"] as const).map((a) => (
                      <SegmentedItem key={a} current={layer.vAlign === a} onClick={() => setL({ vAlign: a })}>
                        {a === "top" ? "위" : a === "middle" ? "가운데" : "아래"}
                      </SegmentedItem>
                    ))}
                  </Segmented>
                  <FieldRow>
                    <Num label="마진" value={layer.margin} min={0} max={1000} onChange={(v) => setL({ margin: v })} />
                    <Num label="패딩" value={layer.padding} min={0} max={1000} onChange={(v) => setL({ padding: v })} />
                  </FieldRow>
                  <ColorField label="배경 상자 색" value={layer.boxColor} onChange={(v) => setL({ boxColor: v, boxOpacity: layer.boxOpacity || 0.6 })} />
                  <Range label="배경 상자 불투명도" value={layer.boxOpacity} min={0} max={1} step={0.01} display={`${Math.round(layer.boxOpacity * 100)}%`} onChange={(v) => setL({ boxOpacity: v })} />
                </>
              )}
              {layer?.kind === "overlay" && (
                <>
                  <ColorField label="덮개 색" value={layer.color} onChange={(v) => setL({ color: v })} />
                  <Range label="불투명도" value={layer.opacity} min={0} max={1} step={0.01} display={`${Math.round(layer.opacity * 100)}%`} onChange={(v) => setL({ opacity: v })} />
                </>
              )}
              {layer?.kind === "sticker" && (
                <>
                  <Field label="모양">
                    <Select value={layer.shape} onChange={(e) => setL({ shape: e.target.value as StickerShape })}>
                      {STICKER_SHAPES.map((s) => (
                        <option key={s} value={s}>
                          {SHAPE_LABEL[s]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={layer.shape === "emoji" ? "이모지" : "글자"}>
                    <Input value={layer.label} maxLength={40} onChange={(e) => setL({ label: e.target.value })} />
                  </Field>
                  <ColorField label="채움 색" value={layer.fill} onChange={(v) => setL({ fill: v })} />
                  <ColorField label="글자 색" value={layer.labelColor} onChange={(v) => setL({ labelColor: v })} />
                  <Range label="불투명도" value={layer.opacity} min={0} max={1} step={0.01} display={`${Math.round(layer.opacity * 100)}%`} onChange={(v) => setL({ opacity: v })} />
                </>
              )}
              {layer?.kind === "image" && (
                <Segmented label="맞춤">
                  <SegmentedItem current={layer.fit === "cover"} onClick={() => setL({ fit: "cover" })}>
                    채우기
                  </SegmentedItem>
                  <SegmentedItem current={layer.fit === "contain"} onClick={() => setL({ fit: "contain" })}>
                    전체 보이기
                  </SegmentedItem>
                </Segmented>
              )}
            </Section>
            <Section title="워터마크(덱 전체)">
              <Segmented label="워터마크">
                <SegmentedItem current={!wm} onClick={() => edit((d) => ({ ...d, watermark: null }))}>
                  끔
                </SegmentedItem>
                <SegmentedItem current={wm?.kind === "text"} onClick={() => edit((d) => ({ ...d, watermark: { ...(d.watermark ?? defaultWatermark()), kind: "text" } }))}>
                  텍스트
                </SegmentedItem>
                <SegmentedItem current={wm?.kind === "image"} onClick={() => edit((d) => ({ ...d, watermark: { ...(d.watermark ?? defaultWatermark()), kind: "image", size: d.watermark?.kind === "image" ? d.watermark.size : 200 } }))}>
                  이미지
                </SegmentedItem>
              </Segmented>
              {wm && (
                <>
                  {wm.kind === "text" ? (
                    <>
                      <Field label="글자">
                        <Input value={wm.text} maxLength={80} onChange={(e) => setWm({ text: e.target.value })} />
                      </Field>
                      <ColorField label="색" value={wm.color} onChange={(v) => setWm({ color: v })} />
                    </>
                  ) : (
                    <Field label="이미지">
                      <Select value={wm.src} onChange={(e) => setWm({ src: e.target.value })}>
                        <option value="">자산에서 고르기</option>
                        {assets.map((a) => (
                          <option key={a.id} value={a.src}>
                            {a.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  )}
                  <Segmented label="반복">
                    <SegmentedItem current={!wm.tile} onClick={() => setWm({ tile: false })}>
                      한 개
                    </SegmentedItem>
                    <SegmentedItem current={wm.tile} onClick={() => setWm({ tile: true })}>
                      반복 타일
                    </SegmentedItem>
                  </Segmented>
                  {!wm.tile && (
                    <Segmented label="위치">
                      {WATERMARK_POSITIONS.map((p) => (
                        <SegmentedItem key={p} current={wm.position === p} onClick={() => setWm({ position: p })}>
                          {POS_LABEL[p]}
                        </SegmentedItem>
                      ))}
                    </Segmented>
                  )}
                  <Range label="불투명도" value={wm.opacity} min={0} max={1} step={0.01} display={`${Math.round(wm.opacity * 100)}%`} onChange={(v) => setWm({ opacity: v })} />
                  <Range label={wm.kind === "text" ? "글자 크기" : "폭"} value={wm.size} min={8} max={1080} step={1} display={`${wm.size}px`} onChange={(v) => setWm({ size: v })} />
                  {wm.tile && (
                    <>
                      <Range label="간격" value={wm.gap} min={40} max={2000} step={10} display={`${wm.gap}px`} onChange={(v) => setWm({ gap: v })} />
                      <Range label="기울기" value={wm.angle} min={-90} max={90} step={1} display={`${wm.angle}°`} onChange={(v) => setWm({ angle: v })} />
                    </>
                  )}
                </>
              )}
            </Section>
          </>
        }
      />
    </Stack>
  );
}
