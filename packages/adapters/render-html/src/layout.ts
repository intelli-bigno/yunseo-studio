// 카드 한 장의 레이아웃 — 카드 예시 v2(docs/design/card-reference/v2/cards-v2.html)의 시각 문법을 satori 요소로 옮겼다.
// 사진 전면 배경 · 질문/답 말풍선(고정 앵커) · 굵기+밑줄 강조 · 번호 목록 상자 · 닫는 강조 상자 · 코너 브랜드 상자.
// 색·간격은 theme.ts 한 곳에서만 온다. 이 파일은 계획(CardPage)만 읽고 정본을 모른다.
import { MARKER_GLYPH, type Strings } from "./strings";
import type { Block, BoxRow, CardPage, Marker, SourceRow } from "./plan/types";
import { THEME as T, CARD_HEIGHT, CARD_WIDTH, FONT_FAMILY } from "./theme";

type Style = Record<string, string | number>;
export type Child = El | string | false | null | undefined | readonly Child[];
/** satori 가 읽는 「React 요소처럼 생긴 객체」 — type · props.style · props.children */
export interface El {
  type: string;
  props: { style: Style; children?: Child; [key: string]: unknown };
}

function h(type: string, style: Style, ...children: Child[]): El {
  const kids = children.flat(2).filter((c) => c !== false && c !== null && c !== undefined && c !== "");
  return { type, props: { style: { display: "flex", ...style }, children: kids.length === 1 ? kids[0] : kids } };
}
/** 줄글(안에 굵은 구·밑줄이 섞이는 글) 컨테이너 — 안쪽 span 을 한 줄로 이어 쓴다 */
function flow(style: Style, ...children: Child[]): El {
  return h("div", { display: "block", ...style }, ...children);
}
const span = (style: Style, text: string): El => h("span", { display: "inline", ...style }, text);

type Tone = "dark" | "paper";
const inkOf = (tone: Tone) => (tone === "dark" ? T.cream : T.ink);

/** `**핵심 구**` 를 굵게 + 밑줄로, 나머지는 그대로 이어 쓴다 */
export function rich(text: string, tone: Tone): Child[] {
  return text.split(/(\*\*.+?\*\*)/g).flatMap((part): Child[] => {
    if (part === "") return [];
    if (part.startsWith("**") && part.endsWith("**")) {
      return [span({ fontWeight: 800, textDecoration: "underline", textDecorationColor: inkOf(tone) }, part.slice(2, -2))];
    }
    return [part];
  });
}

function bubble(text: string, kind: "q" | "a", tone: Tone, prefix: string): El {
  const fill = kind === "q" ? "#FFFFFF" : T.brass;
  const tailSide = kind === "q" ? { left: 46 } : { right: 46 };
  return h(
    "div",
    {
      position: "relative",
      fontSize: 40,
      fontWeight: 800,
      lineHeight: 1.2,
      letterSpacing: "-0.01em",
      padding: "15px 34px 17px",
      border: `4px solid ${T.ink}`,
      borderRadius: 42,
      boxShadow: `6px 6px 0 ${tone === "dark" ? "rgba(0,0,0,.88)" : T.ink}`,
      color: T.ink,
      backgroundColor: fill,
    },
    flow({}, `${prefix} ${text}`),
    // 말풍선 꼬리 — 모서리를 돌려 앉힌 정사각형
    h("div", { position: "absolute", ...tailSide, bottom: -17, width: 26, height: 26, backgroundColor: fill, borderRight: `4px solid ${T.ink}`, borderBottom: `4px solid ${T.ink}`, borderBottomRightRadius: 6, transform: "rotate(45deg) skew(12deg, 12deg)" }),
  );
}

function markerCell(marker: Marker, tone: Tone): El {
  return h("div", { width: 42, flexShrink: 0, fontSize: 26, fontWeight: 600, lineHeight: "51px", color: tone === "dark" ? T.brass : T.ink }, MARKER_GLYPH[marker]);
}

function para(block: Extract<Block, { t: "para" }>, tone: Tone): El {
  const style: Style = { fontSize: 34, lineHeight: 1.5, color: inkOf(tone) };
  if (block.next) return flow({ ...style, color: T.brass, fontWeight: 600 }, block.text);
  const body = flow({ ...style, flex: 1 }, ...rich(block.text, tone));
  return block.marker === undefined ? body : h("div", { flexDirection: "row", alignItems: "flex-start" }, markerCell(block.marker, tone), body);
}

const CIRCLED = ["❶", "❷", "❸", "❹", "❺", "❻", "❼", "❽", "❾", "❿"];
const circled = (n: number): string => CIRCLED[n - 1] ?? String(n);

function boxRow(row: BoxRow, first: boolean): El {
  const lead = row.n === undefined ? "•" : circled(row.n);
  return h(
    "div",
    { flexDirection: "row", padding: "15px 0", fontSize: 31, lineHeight: 1.36, color: T.cream, borderTop: first ? "0px solid transparent" : "1.5px solid rgba(205,164,107,.38)" },
    h("div", { width: 50, flexShrink: 0, fontSize: 34, lineHeight: 1.2, color: row.n === undefined ? T.brass : T.cream }, lead),
    flow({ flex: 1 }, row.title === undefined ? null : span({ fontWeight: 800 }, row.title), row.title !== undefined && row.text !== "" ? " — " : null, ...rich(row.text, "dark")),
  );
}

function box(rows: readonly BoxRow[]): El {
  return h("div", { flexDirection: "column", alignSelf: "stretch", border: `3px solid ${T.brass}`, borderRadius: 28, backgroundColor: "rgba(10,18,28,.62)", padding: "4px 30px" }, ...rows.map((r, i) => boxRow(r, i === 0)));
}

function checks(items: readonly { title: string; hint?: string }[]): El {
  return h(
    "div",
    { flexDirection: "column", gap: 15 },
    ...items.map((item) =>
      h(
        "div",
        { flexDirection: "row" },
        h("div", { width: 50, flexShrink: 0, fontSize: 34, lineHeight: 1.3, color: T.brass }, "□"),
        h("div", { flexDirection: "column", flex: 1 }, flow({ fontSize: 32, fontWeight: 800, lineHeight: 1.3, color: T.cream }, item.title), item.hint === undefined ? null : flow({ fontSize: 24, lineHeight: 1.35, color: T.mut, marginTop: 2 }, item.hint)),
      ),
    ),
  );
}

function close(text: string): El {
  return flow({ alignSelf: "flex-start", backgroundColor: T.cream, color: T.ink, fontSize: 34, fontWeight: 800, lineHeight: 1.42, padding: "12px 24px 14px" }, ...rich(text, "paper"));
}

function sourceRow(row: SourceRow, first: boolean): El {
  return h(
    "div",
    { flexDirection: "row", padding: "20px 0", fontSize: 31, lineHeight: 1.38, color: T.ink, borderTop: first ? "0px solid transparent" : `1.5px solid ${T.paperRule}` },
    h("div", { width: 48, flexShrink: 0, fontWeight: 800, fontSize: 32 }, MARKER_GLYPH[row.marker]),
    h(
      "div",
      { flexDirection: "column", flex: 1 },
      flow({}, span({ fontWeight: 800, textDecoration: "underline", textDecorationColor: T.ink }, row.title), row.detail === "" ? null : ` — ${row.detail}`),
      row.note === undefined ? null : flow({ fontSize: 24, color: T.paperMut, marginTop: 3 }, row.note),
    ),
  );
}

function block(b: Block, tone: Tone): El {
  switch (b.t) {
    case "para":
      return para(b, tone);
    case "box":
      return box(b.rows);
    case "checks":
      return checks(b.items);
    case "close":
      return close(b.text);
    case "sources":
      return h("div", { flexDirection: "column", alignSelf: "stretch" }, ...b.rows.map((r, i) => sourceRow(r, i === 0)));
    case "placeholder":
      return flow({ alignSelf: "stretch", border: `3px dashed ${T.paperMut}`, padding: "16px 22px 17px", fontSize: 28, lineHeight: 1.4, color: T.ink }, ...rich(b.text, "paper"));
    case "banner":
      return flow({ alignSelf: "flex-start", backgroundColor: "#000000", color: "#FFFFFF", fontSize: 34, fontWeight: 800, lineHeight: 1.4, padding: "14px 26px 16px", marginTop: 20 }, b.text);
  }
}

/** 점검 목록 뒤에 닫는 상자가 오면 사이에 가는 줄을 둔다 (v2 .rule) */
function withRules(blocks: readonly Block[], tone: Tone): El[] {
  return blocks.flatMap((b, i): El[] => {
    const prev = blocks[i - 1];
    const rule = b.t === "close" && prev?.t === "checks" ? [h("div", { height: 2, backgroundColor: "rgba(244,240,232,.4)", marginTop: -6 })] : [];
    return [...rule, block(b, tone)];
  });
}

export interface LayoutInput {
  page: CardPage;
  index: number;
  count: number;
  strings: Strings;
  /** 채널 이름. null 이면 아직 정해지지 않음(TBD) */
  brandName: string | null;
  asOf: string | null;
  draft: boolean;
  /** 표지의 「edited by」 운영자 이름. null 이면 미정 */
  operator: string | null;
  /** 배경 사진 data URI. null 이면 토큰 색 배경 */
  background: string | null;
}

function footer(input: LayoutInput, tone: Tone, withCorner: boolean): El[] {
  const { strings: s } = input;
  const muted = tone === "dark" ? T.mut : T.paperMut;
  const name = input.brandName ?? s.channelTbd;
  const parts: Child[] = [
    h("div", { fontWeight: 600, letterSpacing: "0.03em", color: inkOf(tone) }, name),
    h("div", {}, input.asOf === null ? s.asOfMissing : `${s.asOf} ${input.asOf}`),
  ];
  if (input.draft) parts.push(h("div", { border: "1.5px solid currentColor", padding: "0 8px", fontSize: 19, letterSpacing: "0.09em", lineHeight: 1.5 }, s.draftTag));
  const bar = h("div", { position: "absolute", left: 60, bottom: 30, right: 150, flexDirection: "row", alignItems: "center", gap: 16, fontSize: 22, color: muted, whiteSpace: "nowrap" }, ...parts);
  const corner = withCorner
    ? [h("div", { position: "absolute", right: 0, bottom: 0, width: 96, height: 74, backgroundColor: "#000000", color: "#FFFFFF", fontSize: 26, fontWeight: 800, alignItems: "center", justifyContent: "center" }, input.brandName === null ? s.channelShortTbd : [...input.brandName].slice(0, 2).join("").toUpperCase())]
    : [];
  return [bar, ...corner];
}

function background(input: LayoutInput): El[] {
  const photo: Style = input.background === null
    ? { backgroundImage: T.tokenBackground }
    : { backgroundImage: `url(${input.background})`, backgroundSize: "cover", backgroundPosition: "center top", backgroundRepeat: "no-repeat" };
  return [
    h("div", { position: "absolute", left: 0, top: 0, width: CARD_WIDTH, height: CARD_HEIGHT, ...photo }),
    h("div", { position: "absolute", left: 0, top: 0, width: CARD_WIDTH, height: CARD_HEIGHT, backgroundImage: input.page.kind === "cover" ? T.shadeCover : T.shade }),
  ];
}

function cover(input: LayoutInput): El[] {
  const { strings: s, page } = input;
  const logo = input.brandName === null ? "[CHANNEL]" : input.brandName.toUpperCase();
  return [
    ...background(input),
    h("div", { position: "absolute", left: 78, top: 84, fontSize: 46, fontWeight: 400, letterSpacing: "0.34em", color: "#FFFFFF" }, logo),
    h(
      "div",
      { position: "absolute", right: 64, top: 60, width: 244, height: 244, borderRadius: 122, border: "3.5px dashed rgba(255,255,255,.88)", backgroundColor: "rgba(255,255,255,.10)", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", color: "#FFFFFF" },
      h("div", { fontSize: 30, fontWeight: 400, letterSpacing: "0.06em", marginBottom: 6 }, s.editedBy),
      h("div", { fontSize: 25, fontWeight: 600, lineHeight: 1.3 }, input.operator ?? s.operatorTbd),
    ),
    // 제목은 아래 기준선에 붙인다 — 두 줄이든 세 줄이든 채널명 위에서 끝난다
    h("div", { position: "absolute", left: 58, right: 58, bottom: 206, fontSize: 90, fontWeight: 800, lineHeight: 1.1, letterSpacing: "-0.035em", color: "#FFFFFF", textShadow: "0 3px 28px rgba(0,0,0,.5)" }, flow({}, page.title ?? "")),
    h("div", { position: "absolute", left: 0, right: 0, top: 1226, justifyContent: "center", fontSize: 40, fontWeight: 800, letterSpacing: "0.04em", color: T.cream }, input.brandName ?? s.channelTbd),
    h("div", { position: "absolute", left: 0, right: 0, bottom: 34, justifyContent: "center", flexDirection: "row", alignItems: "center", gap: 16, fontSize: 22, color: T.mut }, input.asOf === null ? s.asOfMissing : `${s.asOf} ${input.asOf}`, input.draft ? h("div", { border: "1.5px solid currentColor", padding: "0 8px", fontSize: 19, letterSpacing: "0.09em", lineHeight: 1.5 }, s.draftTag) : null),
  ];
}

/** 본문 장 글 영역: 질문 말풍선이 585 에서 시작하는 고정 앵커. 내용이 길면 위로 자라 푸터와 겹치지 않는다 */
const ANCHOR_TOP = 585;
const FOOTER_RESERVE = 88;

function qaCard(input: LayoutInput): El[] {
  const { page } = input;
  const tone: Tone = page.kind === "sources" ? "paper" : "dark";
  const content = (marginTop: number) =>
    h(
      "div",
      { flexDirection: "column", ...(tone === "paper" ? {} : { minHeight: CARD_HEIGHT - FOOTER_RESERVE - ANCHOR_TOP }) },
      h("div", { flexDirection: "row" }, bubble(page.question ?? "", "q", tone, "Q.")),
      h("div", { flexDirection: "row", justifyContent: "flex-end", marginTop: 26 }, bubble(page.answer ?? "", "a", tone, "A.")),
      h("div", { flexDirection: "column", gap: 24, marginTop, paddingLeft: 8, paddingRight: 8 }, ...withRules(page.blocks, tone)),
    );
  const column =
    tone === "paper"
      ? h("div", { position: "absolute", left: 52, right: 52, top: 84, flexDirection: "column" }, content(48))
      : h("div", { position: "absolute", left: 52, right: 52, top: 330, bottom: FOOTER_RESERVE, flexDirection: "column", justifyContent: "flex-end" }, content(44));
  return [...(tone === "paper" ? [h("div", { position: "absolute", left: 0, top: 0, width: CARD_WIDTH, height: CARD_HEIGHT, backgroundColor: T.paper })] : background(input)), column, ...footer(input, tone, true)];
}

/** 카드 한 장 → satori 가 읽는 요소 트리 (1080×1350) */
export function cardElement(input: LayoutInput): El {
  const children = input.page.kind === "cover" ? cover(input) : qaCard(input);
  return h("div", { position: "relative", width: CARD_WIDTH, height: CARD_HEIGHT, overflow: "hidden", backgroundColor: T.navy, fontFamily: FONT_FAMILY, color: T.cream }, ...children);
}
