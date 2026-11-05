// [L9] 미리보기·묶음 패널의 단계 순서 — 카드 렌더 → 릴스 → 업로드 묶음. 묶음은 릴스 뒤라야 릴스가 함께 들어간다.

export interface FlowStep {
  key: "render" | "reel" | "bundle";
  enabled: boolean;
  done: boolean;
}

const ORDER: readonly FlowStep["key"][] = ["render", "reel", "bundle"];

/** 다음 차례 단계 — 순서대로 첫 「가능하고 아직 안 한」 단계. 릴스를 못 쓰면(비활성) 묶음으로 넘어간다 */
export function nextPipelineStep<S extends FlowStep>(steps: readonly S[]): S | null {
  for (const key of ORDER) {
    const s = steps.find((x) => x.key === key);
    if (s && s.enabled && !s.done) return s;
  }
  return null;
}
