// 화면 전환 안무 계산(순수 함수) — DOM 없이 조각 위치만 받아 「어디로 얼마나 늦게」 움직일지 정한다.
// 이전 화면 조각(out)은 누른 곳에서 바깥으로 흩어지고, 새 화면 조각(in)은 바깥에서 제자리로 모인다.
// 누른 곳에 가까운 조각부터 움직여 「누른 자리에서 부서져 퍼지고, 다시 모여드는」 물결이 된다.
import { choreography, duration } from "@yunseo/design-tokens";

export { choreography };

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PieceMove {
  /** 흩어진 자리까지의 이동(px) — out 은 끝 위치, in 은 시작 위치 */
  dx: number;
  dy: number;
  /** 기울기(deg) */
  rot: number;
  /** 출발 지연(ms) */
  delay: number;
}

export interface ScenePlan {
  moves: PieceMove[];
  /** 마지막 조각이 도착하는 시각(ms) */
  total: number;
}

const round = (n: number) => Math.round(n * 10) / 10;

/** 화면에 보이는 조각만, 상한까지. 큰 덩어리(카드·구획)를 먼저 고르고 남는 자리를 글줄로 채운다. */
export function pickPieces<T>(candidates: { item: T; box: Box; container: boolean }[], viewport: { w: number; h: number }, limit: number = choreography.pieces): T[] {
  const visible = candidates.filter(({ box }) => box.w > 0 && box.h > 0 && box.y < viewport.h && box.y + box.h > 0 && box.x < viewport.w && box.x + box.w > 0);
  const big = visible.filter((c) => c.container);
  const lines = visible.filter((c) => !c.container);
  return [...big, ...lines].slice(0, limit).map((c) => c.item);
}

export function planScene(boxes: Box[], origin: { x: number; y: number }, viewport: { w: number; h: number }, phase: "out" | "in"): ScenePlan {
  const diag = Math.hypot(viewport.w, viewport.h) || 1;
  const info = boxes.map((b, i) => {
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const vx = cx - origin.x;
    const vy = cy - origin.y;
    const dist = Math.hypot(vx, vy);
    return { i, vx, vy, dist };
  });
  // 거리 순서(가까운 것부터) — 같은 거리면 문서 순서
  const order = [...info].sort((a, b) => a.dist - b.dist || a.i - b.i);
  const rank = new Map(order.map((p, r) => [p.i, r]));
  const base = phase === "in" ? choreography.inDelay : 0;
  const moves = info.map(({ i, vx, vy, dist }) => {
    const len = dist || 1;
    // 멀리 있는 조각일수록 더 멀리 날아간다(0.5~1배)
    const reach = choreography.scatter * (0.5 + 0.5 * Math.min(1, dist / (diag / 2)));
    const ux = dist ? vx / len : 0;
    const uy = dist ? vy / len : -1; // 누른 자리 바로 위 조각은 위로
    // 기울기는 좌우 방향을 따르고, 조각마다 조금씩 다르게(순서로 정해지는 값 — 매번 같은 결과)
    const wobble = 0.5 + ((i * 37) % 10) / 20;
    const rot = choreography.tilt * Math.sign(ux || 1) * wobble;
    return { dx: round(ux * reach), dy: round(uy * reach), rot: round(rot), delay: base + (rank.get(i) ?? 0) * choreography.stagger };
  });
  const last = moves.reduce((m, x) => Math.max(m, x.delay), 0);
  const length = phase === "in" ? duration.scene : duration.slow;
  return { moves, total: moves.length ? last + length : 0 };
}
