// 쓰기 API 공통 — JSON 본문을 상한 안에서만 읽고, 최상위가 객체인지 확인한다.
// 상한은 Content-Length 로 먼저 거르고(거짓·생략 대비) 실제 스트림도 상한에서 끊는다 — 큰 본문을 메모리에 다 올리지 않는다.
// 응답 모양: 413 {error:{code:"TOO_LARGE"}} · 400 {error:{code:"BAD_JSON"|"NOT_OBJECT"}}
import { createHash } from "node:crypto";

export const KB = 1024;

export type JsonObjectBody = { ok: true; value: Record<string, unknown>; bytes: number } | { ok: false; response: Response };

const fail = (status: 400 | 413, code: string, message: string): JsonObjectBody => ({ ok: false, response: Response.json({ error: { code, message } }, { status }) });
const tooLarge = (max: number) => fail(413, "TOO_LARGE", `본문이 ${Math.round(max / KB)}KB 를 넘는다`);

/** 본문 바이트를 max 까지만 읽는다 — 넘으면 null */
async function readCapped(req: Request, max: number): Promise<Uint8Array | null> {
  if (!req.body) return new Uint8Array(0);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/**
 * JSON 객체 본문 읽기. emptyAs 를 주면 빈 본문을 그 값으로 본다(새로 만들기처럼 본문이 선택인 POST).
 * badCode 를 주면 400 의 code 를 그 값으로 통일한다(ops 처럼 오류 코드 표가 정해진 API).
 * 배열·null·숫자 같은 최상위 값은 400 — 라우트가 `body.x` 를 읽다 500 이 나지 않게 한다.
 */
export async function readJsonObject(req: Request, max: number, opts: { emptyAs?: Record<string, unknown>; badCode?: string } = {}): Promise<JsonObjectBody> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) return tooLarge(max);
  const bytes = await readCapped(req, max);
  if (!bytes) return tooLarge(max);
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  if (!text.trim()) return opts.emptyAs ? { ok: true, value: opts.emptyAs, bytes: 0 } : fail(400, opts.badCode ?? "BAD_JSON", "본문이 비었다");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return fail(400, opts.badCode ?? "BAD_JSON", "본문이 JSON 이 아니다");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail(400, opts.badCode ?? "NOT_OBJECT", "본문 최상위는 JSON 객체여야 한다");
  return { ok: true, value: value as Record<string, unknown>, bytes: bytes.byteLength };
}

/** 내용으로 만든 강한 ETag — 같은 바이트면 같은 값(sha1 앞 22자, base64url). 304 판정에 쓴다 */
export function contentEtag(bytes: ArrayBuffer | Uint8Array): string {
  return `"${createHash("sha1").update(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).digest("base64url").slice(0, 22)}"`;
}
