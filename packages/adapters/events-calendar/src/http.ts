// 공식 파일 받기 — ICS·JSON 같은 파일 URL 만 받는다(HTML 페이지 긁기 금지: 05 §5.4, 사용자 웹 규칙).
// fetch 는 주입한다: 운영은 Node 내장 fetch, 테스트는 녹화한 응답을 돌려주는 가짜(테스트에서 네트워크 금지).

export type FetchLike = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; headers: { get(name: string): string | null }; text(): Promise<string> }>;

export interface HttpOptions {
  fetch: FetchLike;
  /** 누가 받는지 밝히는 User-Agent — 브라우저로 위장하지 않는다 */
  userAgent: string;
  timeoutMs?: number;
  /** 응답 본문 상한(글자 수). 넘으면 오류 */
  maxChars?: number;
}

export const DEFAULT_USER_AGENT = "yunseo-studio-events/0.1 (private research tool; official schedule files only)";

export async function getFile(url: string, accept: string, options: HttpOptions): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 20_000);
  try {
    const res = await options.fetch(url, { headers: { "user-agent": options.userAgent, accept }, signal: controller.signal });
    if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
    const type = res.headers.get("content-type") ?? "";
    if (/text\/html/i.test(type)) throw new Error(`${url} → HTML 응답 (파일이 아니다, content-type=${type})`);
    const text = await res.text();
    if (text.length > (options.maxChars ?? 5_000_000)) throw new Error(`${url} → 응답이 너무 크다 (${text.length}자)`);
    return text;
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`${url} → 시간 초과`, { cause: error });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
