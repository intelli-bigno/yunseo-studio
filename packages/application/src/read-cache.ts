// 읽기 캐시 — 저장소 앞에 씌우는 데코레이터. 정책(docs/09-performance.md §3):
//  ① 키 = 메서드+인자, 값 = 읽은 결과(깊게 얼림 — 화면이 실수로 고치면 바로 예외).
//  ② 무효화 = 저장소 revision 이 바뀔 때(쓰기 즉시 반영) 또는 TTL 이 지날 때(다른 프로세스가 쓴 경우의 안전망).
//  ③ 같은 키를 동시에 읽으면 한 번만 읽는다(stampede 방지). 항목 수는 상한(LRU)으로 묶어 메모리가 자라지 않게 한다.
import type { StudioRepository } from "./ports";

export interface ReadCacheOptions {
  ttlMs?: number;
  maxEntries?: number;
  now?: () => number;
}

export interface ReadCacheStats {
  hits: number;
  misses: number;
  size: number;
}

export type CachedRepository = StudioRepository & { stats(): ReadCacheStats; clear(): void };

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

export function withReadCache(repo: StudioRepository, options: ReadCacheOptions = {}): CachedRepository {
  const ttlMs = options.ttlMs ?? 30_000;
  const maxEntries = options.maxEntries ?? 32;
  const now = options.now ?? Date.now;
  const store = new Map<string, { value: unknown; at: number; revision: number }>();
  const inflight = new Map<string, Promise<unknown>>();
  let hits = 0;
  let misses = 0;

  async function read<T>(key: string, load: () => Promise<T>): Promise<T> {
    const revision = await repo.revision();
    const hit = store.get(key);
    if (hit && hit.revision === revision && now() - hit.at < ttlMs) {
      hits += 1;
      store.delete(key); // LRU: 맨 뒤로
      store.set(key, hit);
      return hit.value as T;
    }
    const flightKey = `${revision}:${key}`;
    const pending = inflight.get(flightKey);
    if (pending) return (await pending) as T;
    misses += 1;
    const promise = load()
      .then((value) => {
        deepFreeze(value);
        store.delete(key);
        store.set(key, { value, at: now(), revision });
        while (store.size > maxEntries) store.delete(store.keys().next().value as string);
        return value;
      })
      .finally(() => inflight.delete(flightKey));
    inflight.set(flightKey, promise);
    return promise;
  }

  return {
    listPieces: () => read("pieces", () => repo.listPieces()),
    // 한 편은 목록에서 고른다 — 키마다 따로 캐시하면 id 가짓수만큼 항목이 늘어난다
    getPiece: async (id) => (await read("pieces", () => repo.listPieces())).find((p) => p.id === id) ?? null,
    listWeekVariables: () => read("weekVariables", () => repo.listWeekVariables()),
    listEventCandidates: () => read("eventCandidates", () => repo.listEventCandidates()),
    listQueue: () => read("queue", () => repo.listQueue()),
    revision: () => repo.revision(),
    stats: () => ({ hits, misses, size: store.size }),
    clear: () => store.clear(),
  };
}
