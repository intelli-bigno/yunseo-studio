import { describe, expect, it } from "vitest";
import {
  REELS_MAX_MS,
  activeAt,
  addClip,
  addTrack,
  applySourceDuration,
  emptyProject,
  firstFreeStart,
  fmtTime,
  moveClip,
  overlaps,
  projectDuration,
  projectIssues,
  removeClip,
  removeTrack,
  snap,
  sourceSeconds,
  splitClip,
  timelineSpan,
  trimClip,
  type ReelsProject,
} from "./index";

const video = (id: string, duration = 4000, extra = {}) => ({ id, duration, sourceId: "s1", sourceKind: "video" as const, sourceMs: 10_000, ...extra });
const base = (): ReelsProject => addClip(addClip(emptyProject(), "t-video", video("a")), "t-video", video("b", 2000));

describe("클립 추가", () => {
  it("start 를 안 주면 트랙 끝에 붙인다", () => {
    const p = base();
    expect(p.clips.map((c) => [c.id, c.start, c.duration])).toEqual([["a", 0, 4000], ["b", 4000, 2000]]);
    expect(projectDuration(p)).toBe(6000);
  });

  it("겹치는 자리면 뒤 첫 빈자리로 민다", () => {
    const p = addClip(base(), "t-video", video("c", 1000, { start: 1000 }));
    expect(p.clips.find((c) => c.id === "c")!.start).toBe(6000);
    expect(overlaps(p)).toEqual([]);
  });

  it("빈틈에 들어가면 그 자리에 둔다", () => {
    let p = addClip(emptyProject(), "t-video", video("a", 1000));
    p = addClip(p, "t-video", video("b", 1000, { start: 3000 }));
    expect(firstFreeStart(p, "t-video", 1000, 2000)).toBe(1000);
    expect(firstFreeStart(p, "t-video", 1500, 2000)).toBe(4000);
  });

  it("트랙이 받지 않는 종류는 거절한다", () => {
    expect(() => addClip(emptyProject(), "t-text", video("x"))).toThrow();
    expect(() => addClip(emptyProject(), "t-video", { id: "x", duration: 1000, text: "글" })).toThrow();
    expect(addClip(emptyProject(), "t-audio", video("x")).clips).toHaveLength(1); // 영상의 소리만 쓰기
  });
});

describe("트랙", () => {
  it("추가하면 종류별 번호가 붙고, 지우면 그 트랙 클립도 지운다", () => {
    let p = addTrack(base(), "video", "t-v2");
    expect(p.tracks.at(-1)).toEqual({ id: "t-v2", kind: "video", name: "영상 2" });
    p = removeTrack(p, "t-video");
    expect(p.clips).toEqual([]);
  });
});

describe("자르기(split)", () => {
  it("둘로 나누고 오른쪽은 원본 시작점이 밀린다", () => {
    const p = splitClip(base(), "a", 1500, "a2");
    const [l, r] = [p.clips.find((c) => c.id === "a")!, p.clips.find((c) => c.id === "a2")!];
    expect([l.start, l.duration, l.offset]).toEqual([0, 1500, 0]);
    expect([r.start, r.duration, r.offset]).toEqual([1500, 2500, 1500]);
  });

  it("가장자리 바로 옆(최소 길이 미만)은 자르지 않는다", () => {
    const p = base();
    expect(splitClip(p, "a", 50, "z")).toBe(p);
    expect(splitClip(p, "a", 3990, "z")).toBe(p);
  });
});

describe("다듬기(trim)", () => {
  it("끝은 다음 클립 시작에서 멈춘다", () => {
    const p = trimClip(base(), "a", "end", 9000);
    expect(p.clips.find((c) => c.id === "a")!.duration).toBe(4000);
  });

  it("끝은 원본 길이를 넘지 못한다", () => {
    const p = trimClip(removeClip(base(), "b"), "a", "end", 20_000);
    expect(p.clips[0]!.duration).toBe(10_000);
  });

  it("시작을 당기면 원본 시작점도 같이 움직인다", () => {
    const p = trimClip(base(), "b", "start", 5000);
    const b = p.clips.find((c) => c.id === "b")!;
    expect([b.start, b.duration, b.offset]).toEqual([5000, 1000, 1000]);
    // 되돌리면 원본 앞쪽만큼만 살아난다(앞 클립 끝에서도 멈춘다)
    const back = trimClip(p, "b", "start", 0);
    expect(back.clips.find((c) => c.id === "b")).toMatchObject({ start: 4000, offset: 0, duration: 2000 });
  });

  it("최소 길이 아래로 줄지 않는다", () => {
    const p = trimClip(base(), "a", "end", 0);
    expect(p.clips.find((c) => c.id === "a")!.duration).toBe(100);
  });

  it("이미지·글자는 원본 길이 제한 없이 늘어난다", () => {
    const p = addClip(emptyProject(), "t-text", { id: "t", duration: 1000, text: "안녕" });
    expect(trimClip(p, "t", "end", 30_000).clips[0]!.duration).toBe(30_000);
  });
});

describe("이동", () => {
  it("겹치면 뒤 빈자리로 밀리고, 받지 않는 트랙으로는 안 간다", () => {
    let p = moveClip(base(), "b", 1000);
    expect(p.clips.find((c) => c.id === "b")!.start).toBe(4000);
    p = moveClip(base(), "b", 500, "t-text");
    expect(p.clips.find((c) => c.id === "b")!.trackId).toBe("t-video");
  });

  it("같은 종류의 다른 트랙으로 옮긴다", () => {
    const p = moveClip(addTrack(base(), "video", "t-v2"), "a", 2000, "t-v2");
    expect(p.clips.find((c) => c.id === "a")).toMatchObject({ trackId: "t-v2", start: 2000 });
  });

  it("음수로는 가지 않는다", () => {
    expect(moveClip(base(), "a", -500).clips.find((c) => c.id === "a")!.start).toBe(0);
  });

  it("뒤 빈자리로 밀려 끝이 3분 상한을 넘으면 이동을 거부하고 원위치를 지킨다", () => {
    // a(0~4000) · b(4000~6000) 뒤에 상한 1초 전까지(6000~179000) 채우는 클립 c 를 둔다
    const full = addClip(base(), "t-video", video("c", REELS_MAX_MS - 6000 - 1000, { start: 6000 }));
    // c 와 겹치는 자리로 b 를 옮기면 c 뒤(179000)로 밀려 끝이 181000 > 180000 이 된다
    const moved = moveClip(full, "b", 8000);
    expect(moved).toBe(full);
    expect(moved.clips.find((c) => c.id === "b")).toMatchObject({ trackId: "t-video", start: 4000 });
    // 상한에 정확히 닿는 이동은 허용한다
    const edge = moveClip(base(), "b", REELS_MAX_MS - 2000);
    expect(edge.clips.find((c) => c.id === "b")!.start).toBe(REELS_MAX_MS - 2000);
  });
});

describe("재생 위치", () => {
  it("t 에 걸린 클립을 트랙마다 하나씩, 원본 시각과 함께", () => {
    const p = addClip(base(), "t-subtitle", { id: "s", duration: 2000, start: 3000, text: "자막" });
    expect(activeAt(p, 3500).map((x) => x.clip.id)).toEqual(["a", "s"]);
    expect(activeAt(p, 6000)).toEqual([]);
    const b = splitClip(p, "a", 1000, "a2").clips.find((c) => c.id === "a2")!;
    expect(sourceSeconds(b, 1500)).toBe(1.5);
  });

  it("원본 길이를 알게 되면 넘친 클립을 줄인다", () => {
    const p = applySourceDuration(base(), "s1", 3000);
    expect(p.clips.find((c) => c.id === "a")!.duration).toBe(3000);
    expect(applySourceDuration(p, "s1", 3000)).toBe(p);
  });

  it("붙이기·보이는 길이·시간 표기", () => {
    expect(snap(base(), 4080, 100)).toBe(4000);
    expect(snap(base(), 4500, 100)).toBe(4500);
    expect(timelineSpan(emptyProject())).toBe(15_000);
    expect(timelineSpan(base())).toBe(15_000);
    expect(fmtTime(65_400)).toBe("1:05.4");
  });
});

describe("저장 형식 검사", () => {
  it("편집 결과는 통과한다", () => {
    expect(projectIssues(JSON.parse(JSON.stringify(splitClip(base(), "a", 2000, "a2"))))).toEqual([]);
  });

  it("틀린 모양을 잡는다", () => {
    expect(projectIssues(null)).not.toEqual([]);
    expect(projectIssues({ ...emptyProject(), title: "" })).toContain("title 은 1~80자");
    const p = base();
    expect(projectIssues({ ...p, clips: [{ ...p.clips[0], trackId: "없음" }] })).toEqual(["clips[0] 트랙이 없다"]);
    expect(projectIssues({ ...p, clips: [{ ...p.clips[0], duration: 1.5 }] })).toEqual(["clips[0] 모양이 틀렸다"]);
    expect(projectIssues({ ...p, tracks: [...p.tracks, { id: "x", kind: "nope", name: "x" }] })).toEqual(["tracks[4] 모양이 틀렸다"]);
  });
});
