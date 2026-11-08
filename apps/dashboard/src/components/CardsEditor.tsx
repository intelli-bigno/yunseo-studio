"use client";
// [cards] 카드뉴스 편집기 — 들어오자마자 새 덱 캔버스(저장 전 초안, revision 0). 「저장」을 처음 누를 때 덱을 만들고(POST) 이어서 저장(PUT)한다.
// 맨 위 = 한 줄 도구줄(CardsToolbar — 제목 바로 고침·규격·실행취소·추가/내보내기/덱 메뉴·저장·? 단축키 도움말).
// 왼쪽 패널(접기) = 스티커 라이브러리 · 가운데 = 캔버스 + 아래 가로 장 목록(끌어서 순서) · 오른쪽 패널(접기, 폭 끌어 조절·기억) = 레퍼런스 메이슨리 그리드가 패널 전체(탭: 레퍼런스·생성·레이어).
// 요소를 고르면 그 속성이 오른쪽 패널 위에 뜨는 접이식 시트로 나온다(레퍼런스를 가리지 않게 접을 수 있다).
// 같은 편집을 JSON 명령으로도 할 수 있다 — POST /api/cards/:id/ops (docs/13-cards-ops-schema.md).
// 실행취소/다시실행은 덱 스냅숏 스택(같은 칸 연속 입력·한 번의 끌기는 한 단계로 묶는다). 옮길 때 카드 가장자리·가운데·다른 레이어에 붙는다(Alt 로 끔).
import { memo, useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent } from "react";
import {
  CARD_FONTS,
  BLEND_MODES,
  CARD_PRESETS,
  CARD_WEIGHTS,
  DECK_LIMITS,
  OVERLAY_GRADIENTS,
  STICKER_DEFS,
  STICKER_GROUPS,
  STICKER_GROUP_LABEL,
  STICKER_SHAPES,
  WATERMARK_POSITIONS,
  stickerDef,
  addCard,
  addLayer,
  createDeck,
  defaultWatermark,
  dragBox,
  duplicateCard,
  duplicateLayer,
  imageLayer,
  moveCardTo,
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
  type BlendMode,
  type DragMode,
  type OverlayGradient,
  type StickerGroup,
  type StickerShape,
  type Watermark,
  type WatermarkPosition,
} from "@yunseo/domain";
import {
  Button,
  CanvasFit,
  CanvasGuides,
  ColorField,
  DeckAction,
  DeckStrip,
  DeckThumb,
  EditorLayout,
  EmptyState,
  Field,
  FieldRow,
  IconButton,
  Input,
  LayerRow,
  Lightbox,
  NumberField,
  PanelBar,
  PanelPad,
  PanelSection,
  Range,
  RefGrid,
  RefTile,
  Segmented,
  SegmentedItem,
  Select,
  Stack,
  StickerGrid,
  StickerTile,
  Text,
  TextLink,
  Textarea,
  clampRightRatio,
} from "@yunseo/ui";
import { canvasDefaultBackground } from "@yunseo/design-tokens";
// 내보내기 코드(캔버스 그리기)는 「내려받기」를 누를 때 받는다 — 편집기를 여는 데 필요 없다
import type { Ctx2D, LoadedImage } from "@/lib/cards-export";
import { REF_PRIORITY_COUNT, refThumb } from "@/lib/media";
import { filterRefs, refSets } from "@/lib/ref-filter";
import { CardView, cssFamily } from "./CardView";
import { CardsToolbar } from "./CardsToolbar";
import { browserStorage, loadSheetOpen, saveSheetOpen } from "./sheet-memory";

export interface EditorAsset {
  id: string;
  group: "generated" | "reference";
  /** 캔버스 레이어에 들어가는 같은 출처 주소(/api/…) */
  src: string;
  label: string;
  /** 그리드·크게 보기에서 보여줄 주소 — 없으면 src */
  view?: string;
  /** 레퍼런스 묶음·태그·원본 게시물 주소 */
  set?: string;
  tags?: string[];
  href?: string;
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
const DND_CARD = "text/x-cards-card";
const RIGHT_KEY = "ys.cards.right"; // 오른쪽 패널 폭 비율 기억(이 브라우저만)
type RightTab = "ref" | "gen" | "layers";
const GRADIENT_LABEL: Record<OverlayGradient, string> = { none: "단색", "to-top": "↑", "to-bottom": "↓", "to-left": "←", "to-right": "→", radial: "◎" };
const BLEND_LABEL: Record<BlendMode, string> = { normal: "보통", multiply: "곱하기", screen: "스크린", overlay: "오버레이", "soft-light": "소프트 라이트", darken: "어둡게", lighten: "밝게", color: "색상" };
/** 라이브러리 미리보기 그림 — 한 번만 만든다 */
const STICKER_PREVIEW = new Map(STICKER_DEFS.map((s) => [s.id, stickerDataUrl({ sticker: s.id, shape: "rect", ...s.look, w: 160, h: Math.round(160 / s.aspect) })]));
const FONT_LABEL: Record<CardFont, string> = { sans: "고딕(본문 서체)", serif: "명조", mono: "고정폭" };
const KIND_LABEL: Record<CardLayer["kind"], string> = { image: "IMG", text: "TXT", overlay: "DIM", sticker: "STK" };
const SHAPE_LABEL: Record<StickerShape, string> = { rect: "사각형", circle: "원", arrow: "화살표", bubble: "말풍선", badge: "배지", star: "별", emoji: "이모지" };
const POS_LABEL: Record<WatermarkPosition, string> = { tl: "↖", tc: "↑", tr: "↗", ml: "←", mc: "·", mr: "→", bl: "↙", bc: "↓", br: "↘" };

/** 캔버스 글자 서체 — CSS 변수를 실제 이름으로 푼다 */
function canvasFamily(f: CardFont): string {
  if (f === "serif") return cssFamily(f);
  const v = getComputedStyle(document.body).getPropertyValue(f === "sans" ? "--font-sans" : "--font-mono").trim();
  return `${v || (f === "sans" ? "sans-serif" : "monospace")}, ${f === "sans" ? "sans-serif" : "monospace"}`;
}

let seq = 0;
const newId = () => `l${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const draft = (preset: CardPresetId = "4:5"): Loaded => ({ deck: createDeck(newId(), "새 카드뉴스", preset, newId()), revision: 0 });

/**
 * 자산 칸 목록 — memo: 덱을 고칠 때(끌기·글 입력) 편집기가 다시 그려져도 128칸은 입력(items·onPick)이 같으면 건너뛴다.
 * thumbs 면 작은 WebP(1x 256·2x 448)로 받는다(레퍼런스). 위 몇 칸만 즉시, 나머지는 화면에 가까워질 때(지연 로딩).
 */
const AssetTiles = memo(function AssetTiles({ items, action, onPick, thumbs = false }: { items: EditorAsset[]; action: string; onPick: (a: EditorAsset) => void; thumbs?: boolean }) {
  return (
    <RefGrid>
      {items.map((a, i) => {
        const m = thumbs ? refThumb(a.view ?? a.src, i < REF_PRIORITY_COUNT) : null;
        return (
          <RefTile
            key={a.id}
            src={m?.src ?? a.view ?? a.src}
            srcSet={m?.srcSet}
            priority={m?.priority}
            label={a.label}
            action={action}
            onDragStart={(e) => (e.dataTransfer.setData(DND_ASSET, a.id), (e.dataTransfer.effectAllowed = "copy"))}
            onClick={() => onPick(a)}
          />
        );
      })}
    </RefGrid>
  );
});

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
  const { drawCard } = await import("@/lib/cards-export");
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

export function CardsEditor({ initialDecks, initial, assets }: { initialDecks: DeckSummary[]; initial: Loaded | null; assets: EditorAsset[] }) {
  const [decks, setDecks] = useState(initialDecks);
  const [cur, setCur] = useState<Loaded>(() => initial ?? draft());
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "alert" | "accent"; text: string } | null>(null);
  const [tab, setTab] = useState<RightTab>("ref");
  const [query, setQuery] = useState("");
  const [refSet, setRefSet] = useState("");
  const [preview, setPreview] = useState<EditorAsset | null>(null);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(true);
  // 오른쪽 패널 폭(편집기 폭의 비율) — 기본은 CSS 의 40%. 저장된 값이 있으면 마운트 뒤에 적용한다(서버 렌더와 어긋나지 않게)
  const [ratio, setRatio] = useState<number | undefined>(undefined);
  // 접히는 섹션 — 이름별 펼침. 요소 종류별 주 섹션은 기본으로 펼친다
  const [sec, setSec] = useState<Record<string, boolean>>({ layers: true, props: true, "p-text": true, "p-box": false, "p-overlay": true, "p-image": true, "p-adjust": false, "p-sticker": true, "p-place": false, wm: false, "g-tag": true, "g-number": true });
  const isOpen = (k: string) => sec[k] ?? false;
  const toggle = (k: string) => setSec((s) => ({ ...s, [k]: !(s[k] ?? false) }));
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
  // 도구줄 한 줄에 들어가는 알림이라 성공 알림은 잠깐만 둔다(실패는 다음 행동까지)
  useEffect(() => {
    if (msg?.tone !== "accent") return;
    const t = setTimeout(() => setMsg(null), 6000);
    return () => clearTimeout(t);
  }, [msg]);
  // 요소를 고르면 오른쪽 패널을 펼친다 — 속성 시트는 사용자가 접어 둔 상태를 그대로 둔다(접기 기억)
  useEffect(() => {
    if (selected) setRightOpen(true);
  }, [selected]);
  useEffect(() => {
    try {
      const v = Number(localStorage.getItem(RIGHT_KEY));
      if (v > 0) setRatio(clampRightRatio(v));
    } catch {
      /* 저장소를 못 쓰면 기본 폭 */
    }
    setSheetOpen(loadSheetOpen(browserStorage()));
  }, []);
  const toggleSheet = () => {
    const next = !sheetOpen;
    setSheetOpen(next);
    saveSheetOpen(browserStorage(), next);
  };
  const resizeRight = (r: number) => {
    setRatio(r);
    try {
      localStorage.setItem(RIGHT_KEY, r.toFixed(3));
    } catch {
      /* 기억만 못 할 뿐 */
    }
  };

  // 저장 안 한 채 떠나면 묻는다
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  // 단축키 — 입력칸 밖에서: Delete/Backspace 삭제, ⌘/Ctrl+Z 실행취소, ⇧⌘Z·Ctrl+Y 다시실행, ⌘/Ctrl+D 복제, Esc 선택 해제 (크게 보기 중에는 끈다)
  useEffect(() => {
    if (preview) return;
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.closest("input, textarea, select, [contenteditable]") || t.isContentEditable)) return;
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if (mod && k === "z") return e.preventDefault(), e.shiftKey ? redo() : undo();
      if (mod && k === "y") return e.preventDefault(), redo();
      if (!selected) return;
      if (e.key === "Escape") return setSelected(null);
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
  }, [selected, editCard, undo, redo, preview]);

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
        download(blob, (await import("@/lib/cards-export")).exportName(deck.title, i));
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
  // 덱을 고칠 때마다(끌기 한 번에 수십 번) 이 계산과 아래 128칸 그리드가 다시 돌지 않게 입력이 바뀔 때만 만든다
  const refs = useMemo(() => assets.filter((a) => a.group === "reference"), [assets]);
  const gens = useMemo(() => assets.filter((a) => a.group === "generated"), [assets]);
  const sets = useMemo(() => refSets(refs), [refs]);
  const shownRefs = useMemo(() => filterRefs(refs, query, refSet), [refs, query, refSet]);
  const addAssetRef = useRef(addAsset);
  addAssetRef.current = addAsset;
  const pickGen = useCallback((a: EditorAsset) => void addAssetRef.current(a), []);
  const setL = (patch: Partial<CardLayer>, key?: string) => layer && editCard((c) => updateLayer(c, layer.id, patch), key ?? `layer:${layer.id}:${Object.keys(patch).join(",")}`);
  const wm = deck.watermark;
  const setWm = (patch: Partial<Watermark>) => edit((d) => ({ ...d, watermark: d.watermark ? { ...d.watermark, ...patch } : null }), `wm:${Object.keys(patch).join(",")}`);
  const h = hist.current;

  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const addCardAfter = () => (edit((d) => addCard(d, newId(), at)), setIndex(at + 1), setSelected(null));
  const dupCard = (i: number) => (edit((d) => duplicateCard(d, i, newId)), setIndex(i + 1), setSelected(null));
  const delCard = (i: number) => deck.cards.length > 1 && confirm(`${i + 1}번째 장을 지울까요?`) && (edit((d) => removeCard(d, i)), setIndex(Math.max(0, i <= at ? at - 1 : at)), setSelected(null));
  const reorder = (from: number, to: number) => {
    if (from === to) return;
    const curId = deck.cards[at]?.id;
    edit((d) => moveCardTo(d, from, to));
    const order = moveCardTo(deck, from, to).cards;
    setIndex(Math.max(0, order.findIndex((c) => c.id === curId)));
  };
  const sDef = layer?.kind === "sticker" ? stickerDef(layer.sticker) : undefined;

  const left = (
    <>
      <Text tone="mute">끌어서 캔버스에 놓거나 눌러서 가운데에 넣습니다 · {STICKER_DEFS.length}종</Text>
      {STICKER_GROUPS.map((g: StickerGroup) => {
        const list = STICKER_DEFS.filter((s) => s.group === g);
        return (
          <PanelSection key={g} title={STICKER_GROUP_LABEL[g]} meta={list.length} open={isOpen(`g-${g}`)} onToggle={() => toggle(`g-${g}`)}>
            <StickerGrid>
              {list.map((s) => (
                <StickerTile
                  key={s.id}
                  label={s.name}
                  src={STICKER_PREVIEW.get(s.id)!}
                  onDragStart={(e) => (e.dataTransfer.setData(DND_STICKER, s.id), (e.dataTransfer.effectAllowed = "copy"))}
                  onClick={() => put(stickerLayer(newId(), deck.preset, s.id))}
                />
              ))}
            </StickerGrid>
          </PanelSection>
        );
      })}
    </>
  );

  const placeSection = layer && (
    <PanelSection title="배치·순서" open={isOpen("p-place")} onToggle={() => toggle("p-place")}>
      <Field label="이름">
        <Input value={layer.name} maxLength={40} onChange={(e) => setL({ name: e.target.value })} />
      </Field>
      <FieldRow>
        <NumberField live label="X" value={layer.x} min={-5000} max={5000} onChange={(v) => setL({ x: v })} />
        <NumberField live label="Y" value={layer.y} min={-5000} max={5000} onChange={(v) => setL({ y: v })} />
        <NumberField live label="W" value={layer.w} min={24} max={5000} onChange={(v) => setL({ w: v })} />
        <NumberField live label="H" value={layer.h} min={24} max={5000} onChange={(v) => setL({ h: v })} />
      </FieldRow>
      <Range label="회전" value={layer.rotation} min={-180} max={180} step={1} display={`${layer.rotation}°`} onChange={(v) => setL({ rotation: v })} />
      <Stack direction="row" gap={2} wrap>
        <Button variant="secondary" onClick={() => editCard((c) => moveLayerToEdge(c, layer.id, 1))}>맨 앞으로</Button>
        <Button variant="secondary" onClick={() => editCard((c) => moveLayerToEdge(c, layer.id, -1))}>맨 뒤로</Button>
        <Button variant="secondary" onClick={() => editCard((c) => toggleLayerLocked(c, layer.id))}>{layer.locked ? "잠금 풀기" : "잠그기"}</Button>
        <Button variant="secondary" onClick={() => { const id = newId(); editCard((c) => duplicateLayer(c, layer.id, id)); setSelected(id); }}>복제</Button>
        <Button variant="secondary" onClick={() => (editCard((c) => removeLayer(c, layer.id)), setSelected(null))}>삭제</Button>
      </Stack>
    </PanelSection>
  );

  const cardSection = (
    <PanelSection title={`${at + 1}번째 장`} open={isOpen("props")} onToggle={() => toggle("props")}>
      <ColorField label="바탕색" value={card.background} onChange={(v) => editCard((c) => ({ ...c, background: v }), "bg")} />
      <Text tone="mute">캔버스에서 요소를 누르면 속성 시트가 열립니다.</Text>
    </PanelSection>
  );

  const props = (
    <>
      {layer?.kind === "text" && (
        <>
          <PanelSection title="글자" open={isOpen("p-text")} onToggle={() => toggle("p-text")}>
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
            <Range label="크기" value={layer.size} min={12} max={400} step={1} display={`${layer.size}px`} onChange={(v) => setL({ size: v })} />
            <FieldRow>
              <NumberField live label="자간" value={layer.letterSpacing} min={-50} max={200} onChange={(v) => setL({ letterSpacing: v })} />
              <NumberField live label="행간" value={layer.lineHeight} min={0.8} max={3} step={0.05} onChange={(v) => setL({ lineHeight: v })} />
            </FieldRow>
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
          </PanelSection>
          <PanelSection title="여백·배경 상자" open={isOpen("p-box")} onToggle={() => toggle("p-box")}>
            <FieldRow>
              <NumberField live label="마진" value={layer.margin} min={0} max={1000} onChange={(v) => setL({ margin: v })} />
              <NumberField live label="패딩" value={layer.padding} min={0} max={1000} onChange={(v) => setL({ padding: v })} />
            </FieldRow>
            <ColorField label="배경 상자 색" value={layer.boxColor} onChange={(v) => setL({ boxColor: v, boxOpacity: layer.boxOpacity || 0.6 })} />
            <Range label="배경 상자 불투명도" value={layer.boxOpacity} min={0} max={1} step={0.01} display={pct(layer.boxOpacity)} onChange={(v) => setL({ boxOpacity: v })} />
          </PanelSection>
        </>
      )}
      {layer?.kind === "overlay" && (
        <PanelSection title="덮개" open={isOpen("p-overlay")} onToggle={() => toggle("p-overlay")}>
          <ColorField label="색" value={layer.color} onChange={(v) => setL({ color: v })} />
          <Range label="불투명도" value={layer.opacity} min={0} max={1} step={0.01} display={pct(layer.opacity)} onChange={(v) => setL({ opacity: v })} />
          <Segmented label="그라데이션 방향">
            {OVERLAY_GRADIENTS.map((g) => (
              <SegmentedItem key={g} current={layer.gradient === g} onClick={() => setL({ gradient: g })}>
                {GRADIENT_LABEL[g]}
              </SegmentedItem>
            ))}
          </Segmented>
          {layer.gradient !== "none" && (
            <>
              <Range label={layer.gradient === "radial" ? "투명 구간 끝(가운데부터)" : "진한 구간 끝"} value={layer.gradFrom} min={0} max={0.99} step={0.01} display={pct(layer.gradFrom)} onChange={(v) => setL({ gradFrom: Math.min(v, layer.gradTo - 0.01) }, `layer:${layer.id}:grad`)} />
              <Range label={layer.gradient === "radial" ? "진해지는 끝" : "투명해지는 끝"} value={layer.gradTo} min={0.01} max={1} step={0.01} display={pct(layer.gradTo)} onChange={(v) => setL({ gradTo: Math.max(v, layer.gradFrom + 0.01) }, `layer:${layer.id}:grad`)} />
            </>
          )}
          <Field label="블렌드">
            <Select value={layer.blend} onChange={(e) => setL({ blend: e.target.value as BlendMode })}>
              {BLEND_MODES.map((b) => (
                <option key={b} value={b}>
                  {BLEND_LABEL[b]}
                </option>
              ))}
            </Select>
          </Field>
        </PanelSection>
      )}
      {layer?.kind === "image" && (
        <>
          <PanelSection title="이미지" open={isOpen("p-image")} onToggle={() => toggle("p-image")}>
            <Segmented label="맞춤">
              <SegmentedItem current={layer.fit === "cover"} onClick={() => setL({ fit: "cover" })}>
                채우기
              </SegmentedItem>
              <SegmentedItem current={layer.fit === "contain"} onClick={() => setL({ fit: "contain" })}>
                전체 보이기
              </SegmentedItem>
            </Segmented>
            <Range label="가로 위치" value={layer.posX} min={0} max={1} step={0.01} display={pct(layer.posX)} onChange={(v) => setL({ posX: v })} />
            <Range label="세로 위치" value={layer.posY} min={0} max={1} step={0.01} display={pct(layer.posY)} onChange={(v) => setL({ posY: v })} />
            <Range label="확대" value={layer.zoom} min={1} max={4} step={0.01} display={`${layer.zoom.toFixed(2)}×`} onChange={(v) => setL({ zoom: v })} />
          </PanelSection>
          <PanelSection title="보정" open={isOpen("p-adjust")} onToggle={() => toggle("p-adjust")}>
            <Range label="밝기" value={layer.brightness} min={0} max={2} step={0.01} display={pct(layer.brightness)} onChange={(v) => setL({ brightness: v })} />
            <Range label="대비" value={layer.contrast} min={0} max={2} step={0.01} display={pct(layer.contrast)} onChange={(v) => setL({ contrast: v })} />
            <Range label="채도" value={layer.saturation} min={0} max={2} step={0.01} display={pct(layer.saturation)} onChange={(v) => setL({ saturation: v })} />
            <Range label="블러" value={layer.blur} min={0} max={50} step={0.5} display={`${layer.blur}`} onChange={(v) => setL({ blur: v })} />
            <Button variant="secondary" onClick={() => setL({ brightness: 1, contrast: 1, saturation: 1, blur: 0 })}>보정 초기화</Button>
          </PanelSection>
        </>
      )}
      {layer?.kind === "sticker" && (
        <PanelSection title={`스티커 — ${sDef?.name ?? "도형"}`} open={isOpen("p-sticker")} onToggle={() => toggle("p-sticker")}>
          {!sDef && (
            <Field label="모양">
              <Select value={layer.shape} onChange={(e) => setL({ shape: e.target.value as StickerShape })}>
                {STICKER_SHAPES.map((s) => (
                  <option key={s} value={s}>
                    {SHAPE_LABEL[s]}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {(sDef ? sDef.hasLabel : true) && (
            <Field label={sDef?.look.label.includes("|") ? "글자(| 로 두 칸 나눔)" : "글자(줄바꿈 가능)"}>
              <Textarea value={layer.label} maxLength={80} onChange={(e) => setL({ label: e.target.value })} />
            </Field>
          )}
          <Segmented label="채움">
            <SegmentedItem current={layer.fill !== "none"} onClick={() => setL({ fill: layer.fill === "none" ? canvasDefaultBackground : layer.fill })}>
              색
            </SegmentedItem>
            <SegmentedItem current={layer.fill === "none"} onClick={() => setL({ fill: "none" })}>
              없음
            </SegmentedItem>
          </Segmented>
          {layer.fill !== "none" && <ColorField label="채움 색" value={layer.fill} onChange={(v) => setL({ fill: v })} />}
          <ColorField label="글자·포인트 색" value={layer.labelColor} onChange={(v) => setL({ labelColor: v })} />
          <ColorField label="테두리 색" value={layer.stroke} onChange={(v) => setL({ stroke: v, strokeWidth: layer.strokeWidth || 3 })} />
          <Range label="테두리 두께" value={layer.strokeWidth} min={0} max={20} step={0.5} display={`${layer.strokeWidth}`} onChange={(v) => setL({ strokeWidth: v })} />
          <Range label="모서리" value={layer.radius} min={0} max={1} step={0.01} display={pct(layer.radius)} onChange={(v) => setL({ radius: v })} />
          <Range label="그림자" value={layer.shadow} min={0} max={1} step={0.01} display={pct(layer.shadow)} onChange={(v) => setL({ shadow: v })} />
          <Range label="크기(비율 유지)" value={layer.w} min={24} max={cw * 1.5} step={1} display={`${layer.w}×${layer.h}`} onChange={(v) => setL({ w: Math.round(v), h: Math.max(24, Math.round((v * layer.h) / layer.w)) }, `layer:${layer.id}:size`)} />
          <Range label="회전" value={layer.rotation} min={-180} max={180} step={1} display={`${layer.rotation}°`} onChange={(v) => setL({ rotation: v })} />
          <Range label="불투명도" value={layer.opacity} min={0} max={1} step={0.01} display={pct(layer.opacity)} onChange={(v) => setL({ opacity: v })} />
        </PanelSection>
      )}
      {placeSection}
    </>
  );

  const rightBar = (
    <PanelBar>
      <Segmented label="오른쪽 패널">
        <SegmentedItem current={tab === "ref"} onClick={() => setTab("ref")}>
          레퍼런스 {refs.length}
        </SegmentedItem>
        <SegmentedItem current={tab === "gen"} onClick={() => setTab("gen")}>
          생성 {gens.length}
        </SegmentedItem>
        <SegmentedItem current={tab === "layers"} onClick={() => setTab("layers")}>
          레이어
        </SegmentedItem>
      </Segmented>
      {tab === "ref" && (
        <Stack direction="row" gap={2} align="center">
          <Input aria-label="레퍼런스 검색" type="search" placeholder="검색 — 제목·태그" value={query} onChange={(e) => setQuery(e.target.value)} />
          <Stack direction="row" gap={2} align="center">
            <Select aria-label="묶음" value={refSet} onChange={(e) => setRefSet(e.target.value)}>
              <option value="">모든 묶음 {refs.length}</option>
              {sets.map((g) => (
                <option key={g.name} value={g.name}>
                  {g.name} {g.count}
                </option>
              ))}
            </Select>
            <Text tone="mute">
              {shownRefs.length}/{refs.length}
            </Text>
          </Stack>
        </Stack>
      )}
    </PanelBar>
  );

  const right = (
    <>
      {tab === "ref" && (
        <PanelPad>
          {shownRefs.length === 0 ? (
            <EmptyState title="조건에 맞는 레퍼런스가 없습니다" action={<Button variant="secondary" onClick={() => (setQuery(""), setRefSet(""))}>필터 지우기</Button>} />
          ) : (
            <AssetTiles items={shownRefs} action="크게 보기" onPick={setPreview} thumbs />
          )}
        </PanelPad>
      )}
      {tab === "gen" && (
        <PanelPad>{gens.length === 0 ? <EmptyState title="생성 이미지가 없습니다" /> : <AssetTiles items={gens} action="넣기" onPick={pickGen} />}</PanelPad>
      )}
      {tab === "layers" && (
        <>
          <PanelSection title="레이어" meta={layersTop.length} open={isOpen("layers")} onToggle={() => toggle("layers")}>
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
                        <IconButton label="삭제" onClick={() => (editCard((c) => removeLayer(c, l.id)), l.id === selected && setSelected(null))}>
                          ×
                        </IconButton>
                      </>
                    }
                  />
                ))}
              </div>
            )}
          </PanelSection>
          {cardSection}
          <PanelSection title="워터마크(덱 전체)" open={isOpen("wm")} onToggle={() => toggle("wm")}>
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
                      {gens.map((a) => (
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
                <Range label="불투명도" value={wm.opacity} min={0} max={1} step={0.01} display={pct(wm.opacity)} onChange={(v) => setWm({ opacity: v })} />
                <Range label={wm.kind === "text" ? "글자 크기" : "폭"} value={wm.size} min={8} max={1080} step={1} display={`${wm.size}px`} onChange={(v) => setWm({ size: v })} />
                {wm.tile && (
                  <>
                    <Range label="간격" value={wm.gap} min={40} max={2000} step={10} display={`${wm.gap}px`} onChange={(v) => setWm({ gap: v })} />
                    <Range label="기울기" value={wm.angle} min={-90} max={90} step={1} display={`${wm.angle}°`} onChange={(v) => setWm({ angle: v })} />
                  </>
                )}
              </>
            )}
          </PanelSection>
        </>
      )}
    </>
  );

  return (
    <Stack gap={3} grow>
      <CardsToolbar
        title={deck.title}
        onTitle={(v) => edit((d) => ({ ...d, title: v }), "title")}
        preset={deck.preset}
        onPreset={(p) => edit((d) => ({ ...d, preset: p }))}
        size={`${cw}×${ch}`}
        cardCount={deck.cards.length}
        isNew={cur.revision === 0}
        dirty={dirty}
        busy={busy}
        msg={msg}
        canUndo={h.past.length > 0}
        canRedo={h.future.length > 0}
        onUndo={undo}
        onRedo={redo}
        canSave={!busy && (dirty || cur.revision === 0)}
        onSave={save}
        decks={decks}
        currentId={cur.revision > 0 ? deck.id : null}
        onOpen={(id) => void open(id)}
        onNew={fresh}
        onRemove={remove}
        canDeselect={Boolean(selected)}
        onAddText={() => put(textLayer(newId(), deck.preset))}
        onAddOverlay={() => put(overlayLayer(newId(), deck.preset))}
        onAddGradient={() => put({ ...overlayLayer(newId(), deck.preset, 0.85), name: "아래 그라데이션", gradient: "to-top", gradFrom: 0, gradTo: 0.6 })}
        onDeselect={() => setSelected(null)}
        onExportOne={() => void exportCards([at])}
        onExportAll={() => void exportCards(deck.cards.map((_, i) => i))}
      />
      <EditorLayout
        leftLabel="스티커"
        rightLabel="레퍼런스"
        leftOpen={leftOpen}
        rightOpen={rightOpen}
        onToggleLeft={() => setLeftOpen((v) => !v)}
        onToggleRight={() => setRightOpen((v) => !v)}
        left={left}
        right={right}
        rightBar={rightBar}
        rightRatio={ratio}
        onRightRatio={resizeRight}
        sheet={layer ? props : undefined}
        sheetTitle={layer ? `속성 — ${layer.name}` : ""}
        sheetOpen={sheetOpen}
        onToggleSheet={toggleSheet}
        stage={
          <CanvasFit>
            <CardView card={card} preset={deck.preset} watermark={wm} selected={selected} onLayerDown={(l, e) => startDrag(l, "move", e)} onHandleDown={(l, m, e) => startDrag(l, m, e)} onDrop={onDrop}>
              <CanvasGuides v={guides.v} h={guides.h} cw={cw} ch={ch} />
            </CardView>
          </CanvasFit>
        }
        strip={
          <DeckStrip
            label="장 목록(끌어서 순서 바꾸기)"
            actions={
              <>
                <DeckAction primary icon="+" label="장 추가" onClick={addCardAfter} disabled={deck.cards.length >= DECK_LIMITS.cards} />
                <DeckAction icon="⧉" label="장 복제" onClick={() => dupCard(at)} disabled={deck.cards.length >= DECK_LIMITS.cards} />
                <DeckAction icon="×" label="장 삭제" onClick={() => delCard(at)} disabled={deck.cards.length <= 1} />
              </>
            }
          >
            {deck.cards.map((c, i) => (
              <DeckThumb
                key={c.id}
                index={i}
                ratio={cw / ch}
                current={i === at}
                label={`${i + 1}번째 장`}
                onClick={() => (setIndex(i), setSelected(null))}
                dragKey={DND_CARD}
                onDropAt={reorder}
              >
                <CardView card={c} preset={deck.preset} watermark={wm} mini />
              </DeckThumb>
            ))}
          </DeckStrip>
        }
      />
      {preview && (
        <Lightbox
          src={preview.view ?? preview.src}
          label={preview.label}
          meta={preview.set}
          onClose={() => setPreview(null)}
          actions={
            <>
              {preview.href && (
                <TextLink href={preview.href} target="_blank" rel="noreferrer noopener">
                  원본
                </TextLink>
              )}
              <Button variant="primary" onClick={() => (void addAsset(preview), setPreview(null))}>
                캔버스에 넣기
              </Button>
              <Button variant="secondary" autoFocus onClick={() => setPreview(null)}>
                닫기
              </Button>
            </>
          }
        />
      )}
    </Stack>
  );
}
