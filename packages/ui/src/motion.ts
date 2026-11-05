// 모션 실행부(브라우저 전용) — 화면 전환(분해 → 재조립)과 누름 물결.
// 근거: 브라우저 내장 View Transitions API + Web Animations API. 라이브러리(Framer Motion 등)를 싣지 않는다 —
//  ① 첫 화면 JS 가 늘지 않는다(이 파일은 앱이 한가할 때 따로 받는다) ② ui 는 react·토큰만 의존한다는 경계를 지킨다
//  ③ 전환은 이전·새 화면의 「사진」(합성 계층)을 transform·opacity 로만 움직여 레이아웃을 다시 계산하지 않는다.
// 움직임을 줄이도록 설정한 사용자(prefers-reduced-motion)에게는 전환·물결을 전부 건너뛴다.
import { duration, easing } from "@yunseo/design-tokens";
import { pickPieces, planScene, type Box } from "./motion-plan";

/** 큰 덩어리 — 먼저 고른다 */
const CONTAINERS = [".ui-page-head-text > :not(h1)", ".ui-page-head-actions", ".ui-tabs", ".ui-seg", ".ui-card", ".ui-section", ".ui-cal-day", ".ui-paper", ".ui-metric-row"];
/** 글줄 — 남는 자리를 채운다(카드 틀과 따로 날아가 「부서지는」 느낌을 만든다) */
const LINES = [".ui-metric", ".ui-li", ".ui-tr:not(.ui-thead)", ".ui-checkbox", ".ui-slot", ".ui-card-head", ".ui-progress"];
/** 이전·새 화면이 같은 이름을 가지면 한 덩어리로 옮겨 간다(공유 요소) — 화면 제목 */
const SHARED_TITLE = ".ui-page-head h1";
const PRESS = ".ui-btn:not([disabled]), .ui-seg-item, .ui-nav-item:not(.is-disabled), .ui-tab, .ui-li.is-link, .ui-tr.is-link, .ui-slot:not(.is-empty), .ui-thumb, .ui-command-item";

const PIECE_CLASS = "ui-piece";

export function prefersReducedMotion(): boolean {
  return typeof window === "undefined" || !window.matchMedia || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const canTransition = () => typeof document !== "undefined" && typeof document.startViewTransition === "function" && document.visibilityState === "visible" && !prefersReducedMotion();

const boxOf = (el: Element): Box => {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
};

/** 화면 조각 고르기 — 읽기(위치 측정)를 먼저 다 하고 쓰기(이름 붙이기)는 나중에 한 번에(레이아웃 스래싱 없음) */
function collect(prefix: string): { els: HTMLElement[]; boxes: Box[]; title: HTMLElement | null } {
  const page = document.querySelector(".ui-page");
  if (!page) return { els: [], boxes: [], title: null };
  const vp = { w: window.innerWidth, h: window.innerHeight };
  const seen = new Set<Element>();
  const cands: { item: HTMLElement; box: Box; container: boolean }[] = [];
  for (const [sel, container] of [...CONTAINERS.map((s) => [s, true] as const), ...LINES.map((s) => [s, false] as const)]) {
    for (const el of page.querySelectorAll<HTMLElement>(sel)) {
      if (seen.has(el)) continue;
      seen.add(el);
      cands.push({ item: el, box: boxOf(el), container });
    }
  }
  const els = pickPieces(cands, vp);
  const boxes = els.map((el) => cands.find((c) => c.item === el)!.box);
  const title = page.querySelector<HTMLElement>(SHARED_TITLE);
  // 쓰기
  els.forEach((el, i) => {
    el.style.setProperty("view-transition-name", `${prefix}${i}`);
    el.style.setProperty("view-transition-class", PIECE_CLASS);
  });
  title?.style.setProperty("view-transition-name", "ui-title");
  return { els, boxes, title };
}

function release(els: (HTMLElement | null)[]) {
  for (const el of els) {
    el?.style.removeProperty("view-transition-name");
    el?.style.removeProperty("view-transition-class");
  }
}

const transformOf = (dx: number, dy: number, rot: number, scale: number) => `translate(${dx}px, ${dy}px) rotate(${rot}deg) scale(${scale})`;

/**
 * 화면 전환 — update 가 새 화면을 그리는 동안 이전 화면은 조각나 흩어지고, 새 화면 조각이 모여든다.
 * origin: 누른 자리(없으면 화면 가운데). 지원하지 않는 브라우저·움직임 줄이기 설정이면 update 만 한다.
 */
/** 진행 중인 전환 — 다음 이동이 오면 즉시 끊는다(연타·다른 탭 누름이 기다리지 않게) */
let active: ViewTransition | null = null;

/** 진행 중인 전환을 끊는다. 끊었으면 true */
export function interruptScene(): boolean {
  if (!active) return false;
  active.skipTransition();
  active = null;
  return true;
}

export async function sceneTransition(update: () => Promise<void> | void, origin?: { x: number; y: number }): Promise<void> {
  // 전환 중에 또 이동하면 연출을 버리고 새 화면으로 바로 간다
  if (interruptScene() || !canTransition()) {
    await update();
    return;
  }
  const vp = { w: window.innerWidth, h: window.innerHeight };
  const at = origin ?? { x: vp.w / 2, y: vp.h / 2 };
  const old = collect("ui-o");
  let fresh: ReturnType<typeof collect> = { els: [], boxes: [], title: null };
  const vt = document.startViewTransition(async () => {
    release([...old.els, old.title]); // 이전 화면 사진은 이미 찍혔다 — 이름을 돌려준다
    await update();
    fresh = collect("ui-n");
  });
  active = vt;
  try {
    await vt.ready;
  } catch {
    // 전환이 건너뛰어졌다(이름 중복·숨은 탭·다음 이동이 끊음) — 화면은 update 로 바뀐다. 붙인 이름은 모두 돌려준다
    if (active === vt) active = null;
    await vt.updateCallbackDone.catch(() => undefined);
    release([...old.els, old.title, ...fresh.els, fresh.title]);
    return;
  }
  const root = document.documentElement;
  const outPlan = planScene(old.boxes, at, vp, "out");
  outPlan.moves.forEach((m, i) => {
    root.animate(
      [
        { transform: "none", opacity: 1 },
        { transform: transformOf(m.dx, m.dy, m.rot, 0.94), opacity: 0 },
      ],
      { duration: duration.slow, delay: m.delay, easing: easing.in, fill: "both", pseudoElement: `::view-transition-old(ui-o${i})` },
    );
  });
  const inPlan = planScene(fresh.boxes, at, vp, "in");
  inPlan.moves.forEach((m, i) => {
    // 바깥(누른 곳 반대편)에서 출발해 제자리로 — 살짝 지나쳤다 돌아오는 스프링
    root.animate(
      [
        { transform: transformOf(-m.dx, -m.dy, -m.rot, 0.94), opacity: 0 },
        { transform: "none", opacity: 1 },
      ],
      { duration: duration.scene, delay: m.delay, easing: easing.spring, fill: "both", pseudoElement: `::view-transition-new(ui-n${i})` },
    );
  });
  await vt.finished.catch(() => undefined);
  if (active === vt) active = null;
  release([...fresh.els, fresh.title]);
}

/**
 * 주소가 target 이 될 때까지(= 새 화면이 그려질 때까지) 기다린다. 상한 후 포기.
 * requestAnimationFrame 은 쓸 수 없다 — 전환의 update 단계에서는 화면 갱신이 멈춰 rAF 가 오지 않는다(2026-11-05 실측: 전환이 멈춤).
 */
/**
 * 상한을 짧게(300ms) 둔다 — 그동안 이전 화면 사진이 멈춰 있으므로, 서버 렌더가 늦으면 기다리지 않고
 * 새 화면의 자리 표시(loading.tsx 스켈레톤)로 넘어가 전환을 끝낸다.
 */
export function waitForUrl(target: string, limitMs = 300): Promise<void> {
  const want = new URL(target, location.href);
  const t0 = performance.now();
  return new Promise((resolve) => {
    let timer = 0;
    const tick = () => {
      if ((location.pathname === want.pathname && location.search === want.search) || performance.now() - t0 > limitMs) {
        clearTimeout(timer);
        resolve();
      } else timer = window.setTimeout(tick, 16);
    };
    tick();
  });
}

/** 누름 물결 — 누른 자리에서 원이 퍼진다(요소의 ::after 를 Web Animations 로 한 번 재생, DOM 을 더하지 않는다) */
function ripple(e: PointerEvent) {
  if (e.button !== 0 || prefersReducedMotion()) return;
  const el = (e.target as Element | null)?.closest<HTMLElement>(PRESS);
  if (!el || typeof el.animate !== "function") return;
  const r = el.getBoundingClientRect(); // 읽기 한 번
  const size = Math.hypot(r.width, r.height) * 2;
  el.style.setProperty("--rx", `${e.clientX - r.left}px`);
  el.style.setProperty("--ry", `${e.clientY - r.top}px`);
  el.style.setProperty("--rs", `${size}px`);
  el.animate(
    [
      { transform: "translate(-50%, -50%) scale(0)", opacity: 0.28 },
      { transform: "translate(-50%, -50%) scale(1)", opacity: 0 },
    ],
    { duration: duration.slow * 1.5, easing: easing.out, pseudoElement: "::after" },
  );
}

/**
 * 안쪽 링크 누름을 가로채 화면 전환으로 바꾸고, 누름 물결을 켠다. 돌려준 함수로 둘 다 끈다.
 * navigate: 실제 이동(앱이 라우터로 한다) — 새 화면이 그려지면 끝나는 Promise.
 */
export function installMotion(navigate: (href: string) => Promise<void>): () => void {
  const onClick = (e: MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as Element | null)?.closest<HTMLAnchorElement>("a[href]");
    if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download") || a.closest("[role=dialog]")) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
    e.preventDefault(); // 라우터 링크는 이미 막힌 클릭을 다시 처리하지 않는다
    void sceneTransition(() => navigate(url.pathname + url.search + url.hash), { x: e.clientX, y: e.clientY });
  };
  document.addEventListener("click", onClick, true);
  document.addEventListener("pointerdown", ripple, true);
  return () => {
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("pointerdown", ripple, true);
  };
}
