import { describe, expect, it } from "vitest";
import { FakeRepository, piece } from "./fakes";
import { withReadCache } from "./read-cache";

describe("읽기 캐시", () => {
  it("같은 읽기는 저장소를 한 번만 부른다", async () => {
    const repo = new FakeRepository([piece("a")]);
    const cached = withReadCache(repo);
    await cached.listPieces();
    await cached.listPieces();
    await cached.getPiece("a");
    expect(repo.reads.pieces).toBe(1);
    expect(cached.stats()).toMatchObject({ hits: 2, misses: 1 });
  });

  it("revision 이 오르면 즉시 다시 읽는다", async () => {
    const repo = new FakeRepository([piece("a")]);
    const cached = withReadCache(repo);
    await cached.listPieces();
    repo.pieces = [piece("a"), piece("b")];
    repo.rev += 1;
    expect((await cached.listPieces()).map((p) => p.id)).toEqual(["a", "b"]);
    expect(repo.reads.pieces).toBe(2);
  });

  it("TTL 이 지나면 revision 이 같아도 다시 읽는다", async () => {
    const repo = new FakeRepository([piece("a")]);
    let t = 0;
    const cached = withReadCache(repo, { ttlMs: 1000, now: () => t });
    await cached.listPieces();
    t = 999;
    await cached.listPieces();
    expect(repo.reads.pieces).toBe(1);
    t = 1000;
    await cached.listPieces();
    expect(repo.reads.pieces).toBe(2);
  });

  it("동시에 같은 키를 읽으면 한 번만 읽는다", async () => {
    const repo = new FakeRepository([piece("a")]);
    const cached = withReadCache(repo);
    await Promise.all([cached.listPieces(), cached.listPieces(), cached.getPiece("a")]);
    expect(repo.reads.pieces).toBe(1);
  });

  it("결과는 깊게 얼어 있어 화면이 고치면 예외다", async () => {
    const repo = new FakeRepository([piece("a", { stages: [{ key: "k", title: "t", question: "q", body: "b" }] })]);
    const cached = withReadCache(repo);
    const list = await cached.listPieces();
    expect(() => (list as unknown as unknown[]).push(1)).toThrow(TypeError);
    expect(() => {
      list[0]!.stages[0]!.body = "수정";
    }).toThrow(TypeError);
  });

  it("항목 수는 상한을 넘지 않고 가장 오래 안 쓴 것부터 버린다", async () => {
    const repo = new FakeRepository([piece("a")]);
    const cached = withReadCache(repo, { maxEntries: 2 });
    await cached.listPieces();
    await cached.listQueue();
    await cached.listWeekVariables();
    expect(cached.stats().size).toBe(2);
    const before = repo.reads.pieces;
    await cached.listPieces(); // 가장 오래된 것이 밀려나 다시 읽는다
    expect(repo.reads.pieces).toBe(before + 1);
  });

  it("없는 편은 null 이다", async () => {
    const cached = withReadCache(new FakeRepository([piece("a")]));
    expect(await cached.getPiece("zzz")).toBeNull();
  });
});
