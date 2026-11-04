// 화면 전환 연결부 — 모션 코드(@yunseo/ui/motion)는 첫 화면 JS 에 싣지 않고 브라우저가 한가할 때 따로 받는다.
// 받기 전에 누른 이동은 전환 없이 바로 간다(기능은 같고 연출만 빠진다).
type Motion = typeof import("@yunseo/ui/motion");
type Push = (href: string) => void;

let motion: Motion | null = null;

export async function loadMotion(): Promise<Motion> {
  motion ??= await import("@yunseo/ui/motion");
  return motion;
}

/** 라우터 이동을 「새 화면이 그려지면 끝나는」 약속으로 바꾼다 */
export const routerNavigate = (push: Push) => (href: string) => {
  push(href);
  return motion ? motion.waitForUrl(href) : Promise.resolve();
};

/** 단축키·빠른 이동처럼 링크 클릭이 아닌 이동 — 화면 가운데에서 분해·재조립한다 */
export function go(push: Push, href: string): void {
  if (!motion) {
    push(href);
    return;
  }
  void motion.sceneTransition(() => routerNavigate(push)(href));
}
