import { describe, expect, it } from "vitest";
import { eventDecisionIssues, effectiveEventImportance, judgeEventImportance, suggestImportanceAnswers, suggestKindImportance, type EventDecision } from "./importance";
import { CALENDAR_EVENT_KINDS, CALENDAR_KIND_CATEGORY, CALENDAR_KIND_LABEL, calendarEventId, isEventSourceUrl, type CalendarEvent, type EventChange, type StoredEvent } from "./model";
import { planEventMerge } from "./merge";
import { dedupeEventsForDisplay, selectEventCandidates, selectEventWeekVariables } from "./schedule";
import { eventDate, isCalendarDateText, eventKstDisplay, eventKstInputToUtc, eventKstParts, normalizeEventUtc, eventUtcIso } from "./time";

const ev = (patch: Partial<CalendarEvent> = {}): CalendarEvent => ({
  source: "bls-ics",
  externalId: "u-1",
  kind: "inflation_headline",
  title: "Consumer Price Index",
  label: "미국 소비자물가지수(CPI)",
  startsAt: "2026-11-10T13:30:00Z",
  timeKnown: true,
  sourceName: "미 노동통계국(BLS) 발표 일정",
  sourceUrl: "https://www.bls.gov/schedule/news_release/",
  ...patch,
});
const stored = (patch: Partial<StoredEvent> = {}): StoredEvent => {
  const base = ev(patch);
  return { ...base, id: calendarEventId(base.source, base.externalId), firstSeenAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z", removedAt: null, ...patch };
};

describe("시간 — UTC 저장, KST 표시", () => {
  it("UTC 13:30 은 KST 22:30, 날짜가 넘어가면 날짜도 넘어간다", () => {
    expect(eventKstParts("2026-11-10T13:30:00Z")).toEqual({ date: "2026-11-10", time: "22:30", weekday: "화" });
    expect(eventKstParts("2026-12-09T19:00:00Z")).toEqual({ date: "2026-12-10", time: "04:00", weekday: "목" });
  });

  it("KST 입력 → UTC 저장 → 다시 KST 로 보면 같은 값 (왕복)", () => {
    const utc = eventKstInputToUtc("2026-11-12", "04:00");
    expect(utc).toEqual({ startsAt: "2026-11-11T19:00:00Z", timeKnown: true });
    expect(eventKstParts(utc!.startsAt)).toMatchObject({ date: "2026-11-12", time: "04:00" });
  });

  it("시각이 없으면 날짜만 아는 일정 — 시간대 변환 없이 그 날짜 그대로", () => {
    const d = eventKstInputToUtc("2026-11-12", "");
    expect(d).toEqual({ startsAt: "2026-11-12T00:00:00Z", timeKnown: false });
    expect(eventKstDisplay(d!.startsAt, false)).toEqual({ date: "2026-11-12", time: "—", weekday: "목", tz: "" });
    expect(eventDate(d!.startsAt, false)).toBe("2026-11-12");
    expect(eventDate("2026-11-11T19:00:00Z", true)).toBe("2026-11-12");
  });

  it("잘못된 날짜·시각·UTC 형식은 거부한다", () => {
    expect(eventKstInputToUtc("2026-02-30", "10:00")).toBeNull();
    expect(eventKstInputToUtc("2026-11-12", "25:00")).toBeNull();
    expect(isCalendarDateText("2026-13-01")).toBe(false);
    expect(normalizeEventUtc("2026-11-10T13:30:00+09:00")).toBeNull();
    expect(normalizeEventUtc("2026-11-10T13:30Z")).toBe("2026-11-10T13:30:00Z");
    expect(eventUtcIso(2026, 11, 10, 13, 30)).toBe("2026-11-10T13:30:00Z");
  });
});

describe("중요도 판정 (02 §3.2)", () => {
  const q = (a: boolean, b: boolean, c: boolean, d: boolean) => ({ a, b, c, d, e: false });
  it("a·b·c·d 모두 예 → major", () => expect(judgeEventImportance(q(true, true, true, true))).toBe("major"));
  it("a 또는 b 가 예이고 c·d 중 하나가 아니오 → watch", () => {
    expect(judgeEventImportance(q(true, true, true, false))).toBe("watch");
    expect(judgeEventImportance(q(false, true, false, true))).toBe("watch");
  });
  it("a·b 둘 다 아니오 → skip", () => expect(judgeEventImportance(q(false, false, true, true))).toBe("skip"));
  it("[해석] a·b 한쪽만 예이고 c·d 모두 예여도 skip 으로 버리지 않는다", () => expect(judgeEventImportance(q(true, false, true, true))).toBe("watch"));

  it("자동 점검표는 d(운영자 해석)를 채우지 않으므로 제안은 watch 를 넘지 않는다", () => {
    for (const kind of CALENDAR_EVENT_KINDS) {
      expect(suggestImportanceAnswers(kind).d).toBe(false);
      expect(suggestKindImportance(kind)).not.toBe("major");
    }
  });
  it("종류별 기본 제안: 금리 결정·CPI·고용 핵심은 watch, 보조 통계·기타는 skip", () => {
    expect(suggestKindImportance("rate_decision")).toBe("watch");
    expect(suggestKindImportance("inflation_headline")).toBe("watch");
    expect(suggestKindImportance("employment_headline")).toBe("watch");
    expect(suggestKindImportance("growth_detail")).toBe("skip");
    expect(suggestKindImportance("other")).toBe("skip");
  });
  it("모든 종류에 라벨과 큰 분류가 있다", () => {
    for (const kind of CALENDAR_EVENT_KINDS) {
      expect(CALENDAR_KIND_LABEL[kind]).toBeTruthy();
      expect(CALENDAR_KIND_CATEGORY[kind]).toBeTruthy();
    }
  });

  it("사람의 판정이 자동 제안을 덮는다", () => {
    expect(effectiveEventImportance("watch", null)).toBe("watch");
    expect(effectiveEventImportance("watch", { decision: "skip" })).toBe("skip");
  });
  it("판정을 올릴 때만 사유가 필요하다", () => {
    expect(eventDecisionIssues({ suggested: "watch", decision: "major", reason: " " })).toHaveLength(1);
    expect(eventDecisionIssues({ suggested: "watch", decision: "major", reason: "해석 포인트 확보" })).toEqual([]);
    expect(eventDecisionIssues({ suggested: "watch", decision: "skip", reason: "" })).toEqual([]);
    expect(eventDecisionIssues({ suggested: "skip", decision: "watch", reason: "" })).toHaveLength(1);
  });
});

describe("병합 계획 — 중복 제거·변경 감지·사라짐", () => {
  const opts = { source: "bls-ics", now: "2026-11-05T00:00:00Z", complete: true, window: { from: "2026-11-01T00:00:00Z", to: "2027-11-01T00:00:00Z" } };

  it("처음 보는 일정은 insert", () => {
    const plan = planEventMerge([], [ev()], opts);
    expect(plan.inserts).toHaveLength(1);
    expect(plan.updates).toHaveLength(0);
  });

  it("같은 (원천, 외부 id, 일시) 행은 한 건으로 줄고 중복으로 센다", () => {
    const plan = planEventMerge([], [ev(), ev()], opts);
    expect(plan.inserts).toHaveLength(1);
    expect(plan.duplicates).toBe(1);
  });

  it("같은 (원천, 외부 id) 에 일시가 다른 행이 섞이면 나중 행을 쓰고 충돌로 센다", () => {
    const plan = planEventMerge([], [ev(), ev({ startsAt: "2026-11-11T13:30:00Z" })], opts);
    expect(plan.inserts.map((e) => e.startsAt)).toEqual(["2026-11-11T13:30:00Z"]);
    expect(plan.conflicts).toBe(1);
  });

  it("그대로면 unchanged", () => {
    const plan = planEventMerge([stored()], [ev()], opts);
    expect(plan.unchanged).toBe(1);
    expect(plan.updates).toHaveLength(0);
  });

  it("일시가 바뀌면 이력(time_changed: 이전 → 이후)을 남긴다", () => {
    const plan = planEventMerge([stored()], [ev({ startsAt: "2026-11-13T13:30:00Z" })], opts);
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0]!.changes).toEqual([{ eventId: stored().id, at: opts.now, type: "time_changed", from: "2026-11-10T13:30:00Z", to: "2026-11-13T13:30:00Z" }]);
  });

  it("라벨만 바뀌면 이력 없이 조용히 갱신한다", () => {
    const plan = planEventMerge([stored()], [ev({ label: "미국 CPI" })], opts);
    expect(plan.updates[0]!.changes).toEqual([]);
  });

  it("창 안에서 빠진 일정은 removed, 창 밖이거나 complete 가 아니면 건드리지 않는다", () => {
    expect(planEventMerge([stored()], [], opts).removed).toHaveLength(1);
    expect(planEventMerge([stored({ startsAt: "2028-01-01T00:00:00Z" })], [], opts).removed).toHaveLength(0);
    expect(planEventMerge([stored()], [], { ...opts, complete: false }).removed).toHaveLength(0);
  });

  it("사라졌던 일정이 다시 나타나면 restored 이력", () => {
    const plan = planEventMerge([stored({ removedAt: "2026-11-03T00:00:00Z" })], [ev()], opts);
    expect(plan.updates[0]!.changes.map((c) => c.type)).toEqual(["restored"]);
  });

  it("다른 원천의 일정은 건드리지 않는다", () => {
    const other = stored({ source: "fed-calendar", externalId: "x" });
    const plan = planEventMerge([other], [], opts);
    expect(plan.removed).toHaveLength(0);
  });
});

describe("편성 변환 — 후보함·이번 주의 변수", () => {
  const today = "2026-11-05"; // 목요일 → 주 2026-11-02 ~ 11-08
  const cpi = stored({ externalId: "cpi", startsAt: "2026-11-10T13:30:00Z" });
  const jobs = stored({ externalId: "jobs", kind: "employment_headline", label: "미국 고용보고서", startsAt: "2026-11-06T13:30:00Z" });
  const noise = stored({ externalId: "noise", kind: "data_release_other", label: "지역별 생산성", startsAt: "2026-11-06T15:00:00Z" });
  const decide = (e: StoredEvent, decision: EventDecision["decision"], reason = ""): [string, EventDecision] => [e.id, { eventId: e.id, decision, reason, decidedAt: "2026-11-05T01:00:00Z" }];
  const none = new Map<string, EventChange>();

  it("이번 주의 변수: 자동 제안(watch) 이상만 채우고 KST 날짜·시각으로 보여 준다", () => {
    const vars = selectEventWeekVariables({ events: [cpi, jobs, noise], decisions: new Map(), timeChanges: none, today });
    expect(vars).toEqual([{ date: "2026-11-06", time: "22:30", tz: "KST", label: "미국 고용보고서", mark: "fact", source: "미 노동통계국(BLS) 발표 일정", importance: "watch" }]);
  });

  it("사람이 제외(skip)하면 빠지고, major 로 올리면 major 로 나온다", () => {
    const vars = selectEventWeekVariables({ events: [jobs], decisions: new Map([decide(jobs, "skip")]), timeChanges: none, today });
    expect(vars).toEqual([]);
    const up = selectEventWeekVariables({ events: [jobs], decisions: new Map([decide(jobs, "major", "해석 포인트")]), timeChanges: none, today });
    expect(up[0]!.importance).toBe("major");
  });

  it("사람이 올린 skip 후보(노이즈)도 이번 주의 변수에 나온다", () => {
    const vars = selectEventWeekVariables({ events: [noise], decisions: new Map([decide(noise, "watch", "이번 주 관심 주제")]), timeChanges: none, today });
    expect(vars.map((v) => v.label)).toEqual(["지역별 생산성"]);
  });

  it("사라진 일정은 변수에서 빠진다", () => {
    const gone = stored({ externalId: "jobs", kind: "employment_headline", startsAt: "2026-11-06T13:30:00Z", removedAt: "2026-11-05T00:00:00Z" });
    expect(selectEventWeekVariables({ events: [gone], decisions: new Map(), timeChanges: none, today })).toEqual([]);
  });

  it("일시가 바뀐 일정은 출처 줄에 이전 → 이후를 적는다", () => {
    const change: EventChange = { eventId: jobs.id, at: "2026-11-04T00:00:00Z", type: "time_changed", from: "2026-11-05T13:30:00Z", to: "2026-11-06T13:30:00Z" };
    const vars = selectEventWeekVariables({ events: [jobs], decisions: new Map(), timeChanges: new Map([[jobs.id, change]]), today });
    expect(vars[0]!.source).toBe("미 노동통계국(BLS) 발표 일정 · 일시 변경 11.05 22:30 → 11.06 22:30");
  });

  it("후보함: 오늘부터 21일 안, 자동 제안이 skip 인 노이즈는 숨기고 사람이 판정한 건 보인다", () => {
    const far = stored({ externalId: "far", startsAt: "2026-12-30T13:30:00Z" });
    const past = stored({ externalId: "past", startsAt: "2026-11-01T13:30:00Z" });
    const list = selectEventCandidates({ events: [cpi, jobs, noise, far, past], decisions: new Map(), timeChanges: none, today });
    expect(list.map((c) => c.label)).toEqual(["미국 고용보고서", "미국 소비자물가지수(CPI)"]);
    expect(list[0]).toMatchObject({ date: "2026-11-06", decision: null, questions: { a: true, b: true, c: true, d: false, e: true } });
    const judged = selectEventCandidates({ events: [noise], decisions: new Map([decide(noise, "skip")]), timeChanges: none, today });
    expect(judged).toHaveLength(1);
    expect(judged[0]!.decision).toBe("skip");
  });

  it("수동 입력은 자동 제안이 skip 이어도 후보함에 보인다", () => {
    const manual = stored({ source: "manual", externalId: "m1", kind: "other", label: "내가 넣은 일정", startsAt: "2026-11-09T00:00:00Z", timeKnown: false });
    const list = selectEventCandidates({ events: [manual], decisions: new Map(), timeChanges: none, today });
    expect(list.map((c) => c.label)).toEqual(["내가 넣은 일정"]);
  });

  it("같은 이름·시각이면 공식 원천을 남기고 수동 입력은 접는다", () => {
    const manual = stored({ source: "manual", externalId: "m2" });
    expect(dedupeEventsForDisplay([manual, cpi]).map((e) => e.source)).toEqual(["bls-ics"]);
    expect(dedupeEventsForDisplay([cpi, manual]).map((e) => e.source)).toEqual(["bls-ics"]);
  });
});

describe("모델", () => {
  it("id 는 (원천, 외부 id) 로 정해지고 일시와 무관하다", () => {
    expect(calendarEventId("bls-ics", "u-1")).toBe(calendarEventId("bls-ics", "u-1"));
    expect(calendarEventId("bls-ics", "u-1")).not.toBe(calendarEventId("bea-ics", "u-1"));
  });
  it("확인 출처 URL 은 http(s) 만", () => {
    expect(isEventSourceUrl("https://www.bls.gov/")).toBe(true);
    expect(isEventSourceUrl("javascript:alert(1)")).toBe(false);
    expect(isEventSourceUrl("bls.gov")).toBe(false);
  });
});
