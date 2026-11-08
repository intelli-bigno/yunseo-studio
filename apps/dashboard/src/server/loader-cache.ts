// 서버 메모리 캐시 — 키마다 한 번만 불러오고(같은 키 동시 요청은 한 번의 불러오기를 나눠 쓴다), 결과를 크기 상한 안에서 LRU 로 둔다.
// 실패(null·예외)는 남기지 않는다 — 다음 요청이 다시 시도한다. 모든 항목에 상한이 있어 메모리가 요청 수에 비례해 자라지 않는다.
export interface LoaderCacheOptions {
  maxEntries: number;
  maxBytes: number;
}

export interface LoaderCache<V extends { bytes: number }> {
  get(key: string, load: () => Promise<V | null>): Promise<V | null>;
  /** 키를 지운다(원본이 바뀌었을 때) — 진행 중인 불러오기는 끝나도 남기지 않는다 */
  invalidate(key: string): void;
  clear(): void;
  stats(): { entries: number; bytes: number; inflight: number };
}

export function createLoaderCache<V extends { bytes: number }>({ maxEntries, maxBytes }: LoaderCacheOptions): LoaderCache<V> {
  const map = new Map<string, V>(); // 삽입 순서 = 오래된 순(읽으면 맨 뒤로)
  const inflight = new Map<string, Promise<V | null>>();
  const dropped = new Set<string>();
  let total = 0;

  const evict = () => {
    for (const [k, v] of map) {
      if (map.size <= maxEntries && total <= maxBytes) break;
      map.delete(k);
      total -= v.bytes;
    }
  };
  const put = (key: string, v: V) => {
    if (v.bytes > maxBytes) return; // 하나가 상한보다 크면 아예 두지 않는다
    const old = map.get(key);
    if (old) total -= old.bytes;
    map.delete(key);
    map.set(key, v);
    total += v.bytes;
    evict();
  };

  return {
    async get(key, load) {
      const hit = map.get(key);
      if (hit) {
        map.delete(key);
        map.set(key, hit);
        return hit;
      }
      const pending = inflight.get(key);
      if (pending) return pending;
      const p = load()
        .then((v) => {
          if (v && !dropped.has(key)) put(key, v);
          return v;
        })
        .finally(() => {
          inflight.delete(key);
          dropped.delete(key);
        });
      inflight.set(key, p);
      return p;
    },
    invalidate(key) {
      const old = map.get(key);
      if (old) total -= old.bytes;
      map.delete(key);
      if (inflight.has(key)) dropped.add(key);
    },
    clear() {
      map.clear();
      total = 0;
      for (const k of inflight.keys()) dropped.add(k);
    },
    stats: () => ({ entries: map.size, bytes: total, inflight: inflight.size }),
  };
}
