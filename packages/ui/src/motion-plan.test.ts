import { describe, expect, it } from "vitest";
import { choreography, pickPieces, planScene, type Box } from "./motion-plan";

const vp = { w: 1440, h: 900 };
const grid = (n: number): Box[] => Array.from({ length: n }, (_, i) => ({ x: (i % 4) * 340 + 24, y: Math.floor(i / 4) * 200 + 80, w: 320, h: 180 }));

describe("화면 전환 안무", () => {
  it("누른 곳에 가까운 조각부터 출발하고, 각 조각은 누른 곳에서 멀어지는 쪽으로 흩어진다", () => {
    const boxes = grid(8);
    const origin = { x: 24 + 160, y: 80 + 90 }; // 첫 조각 한가운데
    const { moves } = planScene(boxes, origin, vp, "out");
    expect(moves[0]!.delay).toBe(0);
    const far = moves[7]!;
    expect(far.delay).toBeGreaterThan(moves[1]!.delay);
    expect(far.dx).toBeGreaterThan(0); // 오른쪽 아래 조각은 오른쪽·아래로
    expect(far.dy).toBeGreaterThan(0);
  });

  it("이동 거리·기울기는 토큰 상한 안이고, 새 조각은 inDelay 뒤에 출발한다", () => {
    const boxes = grid(choreography.pieces);
    const out = planScene(boxes, { x: vp.w / 2, y: vp.h / 2 }, vp, "out");
    const inn = planScene(boxes, { x: vp.w / 2, y: vp.h / 2 }, vp, "in");
    for (const m of [...out.moves, ...inn.moves]) {
      expect(Math.hypot(m.dx, m.dy)).toBeLessThanOrEqual(choreography.scatter + 0.2);
      expect(Math.abs(m.rot)).toBeLessThanOrEqual(choreography.tilt);
    }
    expect(Math.min(...inn.moves.map((m) => m.delay))).toBe(choreography.inDelay);
    expect(inn.total).toBeLessThanOrEqual(choreography.budget);
  });

  it("같은 입력은 같은 안무(무작위 없음)", () => {
    const a = planScene(grid(6), { x: 10, y: 10 }, vp, "in");
    const b = planScene(grid(6), { x: 10, y: 10 }, vp, "in");
    expect(a).toEqual(b);
  });

  it("조각은 화면 안의 것만, 큰 덩어리 먼저, 상한까지", () => {
    const c = (id: string, y: number, container: boolean) => ({ item: id, box: { x: 0, y, w: 100, h: 40 }, container });
    const picked = pickPieces([c("line1", 10, false), c("card", 60, true), c("below", 2000, true), c("line2", 120, false)], vp, 2);
    expect(picked).toEqual(["card", "line1"]);
  });
});
