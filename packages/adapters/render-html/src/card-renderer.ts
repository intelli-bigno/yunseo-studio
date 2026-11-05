// CardRenderer 구현 — 콘텐츠 정본 한 편 → 카드 PNG 세트(1080×1350) + 캡션·해시태그·대체텍스트.
// 순서: 정본 검증 → 렌더 전 검사(금지 표현·글자 상한·출처/기준 시점) → 카드 계획 → 레이아웃 → PNG.
// block 이 하나라도 있으면 아무것도 쓰지 않고 거부한다. warn 은 결과의 warnings 에 담는다.
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CardRenderResult, CardRenderer, ContentDocument, RenderedFile } from "@yunseo/application";
import {
  buildPublishText,
  contentBlockers,
  contentKindOf,
  formatIdOf,
  publishTextFindings,
  validateContentDoc,
  type ContentBody,
  type ContentFinding,
  type ContentRules,
} from "@yunseo/domain";
import { backgroundDataUri, type Backgrounds } from "./backgrounds";
import { cardElement } from "./layout";
import { altTextOf } from "./plan/alt";
import { planCards, type CardPage, type PlanContext } from "./plan";
import { createRasterizer, pngSize, type Rasterizer } from "./raster";
import { stringsFor, type Strings } from "./strings";
import { CARD_HEIGHT, CARD_WIDTH } from "./theme";

export interface HtmlCardRendererOptions {
  /** 금지 표현 규칙 + 포맷 프리셋(글자 상한·카드 장면 문구). presets-schema 의 로드 결과에서 만든다 */
  rules: ContentRules;
  /** 채널 이름·운영자 이름. 비었거나 TBD 면 카드에 자리표시를 그리고 경고한다 */
  brand?: { name: string | null; operator?: string | null };
  /** 확정된 고지 문구(투자 권유 아님). 없으면 캡션은 초안 문구를 쓰고 경고한다 */
  disclosure?: string | null;
  /** 슬롯 이름 → 배경 이미지 파일. 지정이 없으면 토큰 색 배경 */
  backgrounds?: Backgrounds | undefined;
  /** 테스트에서 래스터라이저를 바꿔 끼운다 */
  rasterizer?: Rasterizer;
}

/** 렌더 전 검사에서 block 이 나와 렌더를 거부했다 */
export class ContentBlockedError extends Error {
  readonly findings: ContentFinding[];
  constructor(pieceId: string, findings: ContentFinding[]) {
    super(`렌더 거부 ${pieceId}: block ${findings.length}건\n${findings.map((f) => `- [${f.code}] ${f.path}: ${f.message}`).join("\n")}`);
    this.name = "ContentBlockedError";
    this.findings = findings;
  }
}

/** 정본이 스키마를 통과하지 못했다 */
export class InvalidContentError extends Error {
  readonly errors: string[];
  constructor(pieceId: string, errors: string[]) {
    super(`정본 오류 ${pieceId}: ${errors.length}건\n${errors.map((m) => `- ${m}`).join("\n")}`);
    this.name = "InvalidContentError";
    this.errors = errors;
  }
}

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const line = (f: ContentFinding) => `${f.path}: ${f.message}`;
const isPlaceholder = (value: string | null | undefined): value is null | undefined => value === null || value === undefined || value.trim() === "" || value.trim() === "TBD";

function planContext(body: ContentBody, strings: Strings, rules: ContentRules, disclosure: string | null, warnings: string[]): PlanContext {
  const format = rules.formats.find((f) => f.id === formatIdOf(body.schema));
  const lang = body.language.toLowerCase().startsWith("ko") ? "ko" : "en";
  const missing = new Set<string>();
  return {
    s: strings,
    disclosure,
    page(slot, index) {
      const page = format?.cards.find((c) => c.slot === slot)?.pages?.[index];
      const q = page?.q[lang] ?? page?.q["en"];
      if (q === undefined && !missing.has(`${slot}#${index}`)) {
        missing.add(`${slot}#${index}`);
        warnings.push(`포맷 프리셋에 ${slot} ${index + 1}번째 장의 질문(${lang})이 없다 — 말풍선이 비어 있다`);
      }
      return { q: q ?? "", a: page?.a?.[lang] ?? page?.a?.["en"] ?? null };
    },
  };
}

export function createHtmlCardRenderer(options: HtmlCardRendererOptions): CardRenderer {
  const rasterizer = options.rasterizer ?? createRasterizer();

  return {
    async render(doc: ContentDocument, outDir: string): Promise<CardRenderResult> {
      const parsed = validateContentDoc(doc.body);
      if (!parsed.ok) throw new InvalidContentError(doc.id, parsed.errors);
      const body = parsed.value;
      const mismatch: string[] = [];
      if (doc.schema !== body.schema) mismatch.push(`schema: 문서(${doc.schema})와 본문(${body.schema})이 다르다`);
      if (doc.kind !== contentKindOf(body)) mismatch.push(`kind: 문서(${doc.kind})와 본문(${body.type})이 다르다`);
      if (doc.id !== body.id) mismatch.push(`id: 문서(${doc.id})와 본문(${body.id})이 다르다`);
      if (mismatch.length > 0) throw new InvalidContentError(doc.id, mismatch);

      // 1) 렌더 전 검사 — block 이면 거부
      const { block, warn } = contentBlockers(body, options.rules);
      const warnings: string[] = warn.map(line);
      const { strings, fallback } = stringsFor(body.language);
      if (fallback) warnings.push(`카드 문구가 ${body.language} 를 지원하지 않아 영어 문구를 썼다`);

      // 2) 카드 계획 → 캡션 (캡션도 같은 검사를 받는다)
      const disclosure = options.disclosure ?? null;
      const pages = planCards(body, planContext(body, strings, options.rules, disclosure, warnings));
      const publish = buildPublishText(body, { disclosure, cardCount: pages.length });
      const captionFindings = publishTextFindings(publish, options.rules.banned);
      block.push(...captionFindings.filter((f) => f.severity === "block"));
      warnings.push(...captionFindings.filter((f) => f.severity === "warn").map(line), ...publish.warnings);
      if (block.length > 0) throw new ContentBlockedError(doc.id, block);

      const brandName = isPlaceholder(options.brand?.name) ? null : (options.brand?.name ?? null);
      const operator = isPlaceholder(options.brand?.operator) ? null : (options.brand?.operator ?? null);
      if (brandName === null) warnings.push("채널 이름이 정해지지 않았다(TBD) — 카드에 자리표시를 그렸다. 게시 전에 확정해야 한다");
      if (body.status === "draft") warnings.push("draft 이므로 카드에 초안 표시를 그렸다 — 게시 불가");

      // 3) 카드 그리기
      await mkdir(outDir, { recursive: true });
      const cards: RenderedFile[] = [];
      const width = String(pages.length).length;
      for (const [index, page] of pages.entries()) {
        const file = backgroundOf(page, options.backgrounds, warnings);
        const element = cardElement({ page, index, count: pages.length, strings, brandName, asOf: body.as_of, draft: body.status === "draft", operator, background: file });
        const bytes = await rasterizer.png(element);
        const size = pngSize(bytes);
        if (size?.width !== CARD_WIDTH || size.height !== CARD_HEIGHT) {
          throw new Error(`카드 ${index + 1}(${page.slot}) 크기 오류: ${size ? `${size.width}x${size.height}` : "PNG 아님"} (기대 ${CARD_WIDTH}x${CARD_HEIGHT})`);
        }
        const name = `${String(index + 1).padStart(Math.max(2, width), "0")}-${page.slot}.png`;
        const path = join(outDir, name);
        await writeFile(path, bytes);
        cards.push({ name, path, bytes: bytes.byteLength, sha256: sha256(bytes) });
      }

      return {
        pieceId: body.id,
        cards,
        caption: publish.caption,
        hashtags: publish.hashtags,
        altTexts: pages.map((page, index) => altTextOf(page, index, pages.length, strings)),
        warnings,
      };
    },
  };
}

/** 슬롯에 지정된 배경 파일 → data URI. 지정이 없으면 null(토큰 색 배경), 파일이 없으면 오류 */
function backgroundOf(page: CardPage, backgrounds: Backgrounds | undefined, warnings: string[]): string | null {
  const path = backgrounds?.[page.slot];
  if (path === undefined) return null;
  if (!existsSync(path)) throw new Error(`배경 ${page.slot}: 파일이 없다 (${path})`);
  const uri = backgroundDataUri(path);
  if (uri === null) warnings.push(`배경 ${page.slot}: jpg·png 만 쓸 수 있다 (${path}) — 토큰 색 배경으로 그렸다`);
  return uri;
}
