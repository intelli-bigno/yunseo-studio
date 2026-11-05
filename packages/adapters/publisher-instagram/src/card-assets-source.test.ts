import { describe, expect, it } from "vitest";
import type { CardAssets, StudioRepository } from "@yunseo/application";
import type { Piece } from "@yunseo/domain";
import { createCardAssetsPublishSource } from "./card-assets-source";

function pngBytes(width: number, height: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 0);
  const v = new DataView(b.buffer);
  v.setUint32(16, width);
  v.setUint32(20, height);
  return b;
}

const piece = (patch: Partial<Piece>): Piece => ({ id: "P-1", kind: "pre", title: "제목", slot: "2026-11-04T21:00", status: "drafted", gates: { G1: "passed", G2: "todo", G3: "todo" }, blocker: null, viewpoint: "핵심 관점", stages: [], claims: [], ...patch });

const assets = (files: Record<string, Uint8Array>): CardAssets => ({
  activeSet: async () => ({ id: "a", label: "x", names: Object.keys(files), aspect: "3 / 4" }),
  read: async (name) => (files[name] ? { bytes: files[name]!, contentType: "image/png", etag: '"x"' } : null),
});
const repoOf = (p: Piece | null): Pick<StudioRepository, "getPiece"> => ({ getPiece: async () => p });

describe("createCardAssetsPublishSource", () => {
  it("카드 PNG 를 계약 모양으로 읽고 실측 크기·해시·임시 캡션을 돌려준다", async () => {
    const source = createCardAssetsPublishSource({ repo: repoOf(piece({ cards: ["v2-01", "v2-02"] })), cards: assets({ "v2-01": pngBytes(1080, 1350), "v2-02": pngBytes(1080, 1350) }) });
    const result = await source.cards("P-1");
    expect(result?.cards.map((c) => [c.name, c.bytes])).toEqual([["v2-01.png", 33], ["v2-02.png", 33]]);
    expect(result?.cards[0]?.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result?.caption).toBe("핵심 관점");
    expect(result?.altTexts).toEqual([]);
    expect(result?.warnings[0]).toContain("임시 구성");
    expect(await source.imageSize?.(result!.cards[0]!)).toEqual({ width: 1080, height: 1350 });
  });

  it("읽지 못한 카드는 건너뛰고 경고, 하나도 못 읽으면 null", async () => {
    const some = createCardAssetsPublishSource({ repo: repoOf(piece({ cards: ["v2-01", "v2-02"] })), cards: assets({ "v2-01": pngBytes(1080, 1350) }) });
    const result = await some.cards("P-1");
    expect(result?.cards).toHaveLength(1);
    expect(result?.warnings).toContain("카드 v2-02 파일을 읽지 못했다");
    const none = createCardAssetsPublishSource({ repo: repoOf(piece({ cards: ["v2-01"] })), cards: assets({}) });
    expect(await none.cards("P-1")).toBeNull();
  });

  it("카드 목록이 없는 편·없는 편·릴스는 null", async () => {
    expect(await createCardAssetsPublishSource({ repo: repoOf(piece({})), cards: assets({}) }).cards("P-1")).toBeNull();
    expect(await createCardAssetsPublishSource({ repo: repoOf(null), cards: assets({}) }).cards("X")).toBeNull();
    expect(await createCardAssetsPublishSource({ repo: repoOf(piece({ cards: ["a"] })), cards: assets({}) }).reel("P-1")).toBeNull();
  });

  it("크기를 읽지 못한 파일은 null (모르는 형식)", async () => {
    const source = createCardAssetsPublishSource({ repo: repoOf(piece({ cards: ["v2-01"] })), cards: assets({ "v2-01": new Uint8Array([1, 2, 3, 4]) }) });
    const result = await source.cards("P-1");
    expect(await source.imageSize?.(result!.cards[0]!)).toBeNull();
  });
});
