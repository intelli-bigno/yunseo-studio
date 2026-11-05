import { describe, expect, it } from "vitest";
import { collectEvents, createMemoryEventFeed } from "@yunseo/application";
import { fakeFetch, fixture, type FakeReply } from "./fixtures";
import { fedDescriptionText, FED_CALENDAR_URL, parseFedCalendar, parseFedTime, createFedCalendarSource } from "./fed-calendar";
import { BEA_ICS_URL, BLS_ICS_URL, createBeaIcsSource, createBlsIcsSource } from "./ics-sources";
import { classifyBea, classifyBls, classifyFed } from "./kinds";
import { createOfficialSources, describeOfficialSources } from "./index";

const WIDE = { from: "2020-01-01T00:00:00Z", to: "2030-01-01T00:00:00Z" };

describe("연준 달력 JSON — 녹화 픽스처", () => {
  const parsed = parseFedCalendar(fixture("fed-calendar.json"));

  it("FOMC·베이지북만 가져오고(통계·연설·빈 항목 제외) 미 동부 시각을 UTC 로 바꾼다", () => {
    expect(parsed.events.map((e) => [e.label, e.startsAt])).toEqual([
      ["FOMC 정책금리 결정 발표", "2026-12-09T19:00:00Z"], // 2:00 p.m. EST
      ["FOMC 정책금리 결정 발표", "2026-10-28T18:00:00Z"], // 2:00 p.m. EDT
      ["FOMC 의사록 공개", "2026-11-18T19:00:00Z"],
      ["FOMC 기자회견", "2026-12-09T19:30:00Z"],
      ["연준 베이지북", "2026-11-25T19:00:00Z"],
    ]);
  });

  it("종류·출처·메모: 설명의 HTML 은 평문으로, 출처는 공식 페이지", () => {
    const meeting = parsed.events[0]!;
    expect(meeting).toMatchObject({ source: "fed-calendar", externalId: "FOMC|FOMC Meeting|2026-12", kind: "rate_decision", timeKnown: true, sourceUrl: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm" });
    expect(meeting.note).toBe("Two-day meeting, December 8 - 9 Press Conference");
    expect(parsed.events[2]!.kind).toBe("central_bank_minutes");
  });

  it("type 목록을 넓히면 여러 날짜(\"1, 2, 3 …\")를 날짜별 일정으로 펼친다", () => {
    const all = parseFedCalendar(fixture("fed-calendar.json"), ["Stat"]);
    const h15 = all.events.filter((e) => e.title.startsWith("H.15"));
    expect(h15).toHaveLength(22);
    expect(new Set(h15.map((e) => e.externalId)).size).toBe(22);
    expect(h15[0]).toMatchObject({ startsAt: "2026-12-01T21:15:00Z", kind: "data_release_other" });
  });

  it("연설은 기본에서 빠지고, 넓히면 들어온다. 월이 비어 날짜를 알 수 없는 항목은 경고만 남긴다", () => {
    expect(parsed.events.some((e) => e.kind === "speech")).toBe(false);
    const wide = parseFedCalendar(fixture("fed-calendar.json"), ["Speeches", "events"]);
    expect(wide.events.map((e) => [e.kind, e.startsAt])).toEqual([["speech", "2026-11-06T17:15:00Z"]]);
    expect(wide.warnings).toEqual(["연준 항목 건너뜀 (type=events, title=Discussion -- Governor Michelle W. Bowman, month=없음)"]);
  });

  it("시각 문자열 해석 / 설명 HTML 해석", () => {
    expect(parseFedTime("2:00 p.m.")).toEqual([14, 0]);
    expect(parseFedTime("12:15 p.m.")).toEqual([12, 15]);
    expect(parseFedTime("12:05 a.m.")).toEqual([0, 5]);
    expect(parseFedTime("9:15 a.m.")).toEqual([9, 15]);
    expect(parseFedTime("")).toBeNull();
    expect(parseFedTime("TBD")).toBeNull();
    expect(fedDescriptionText("&lt;p&gt;Meeting of October 27-28&lt;/p&gt;")).toBe("Meeting of October 27-28");
  });

  it("형식이 바뀌면(JSON 아님·events 없음) 오류로 끝난다", () => {
    expect(() => parseFedCalendar("<html>")).toThrow(/JSON/);
    expect(() => parseFedCalendar("{}")).toThrow(/events/);
  });

  it("원천: 가짜 fetch 로 받아 창 안 일정만 돌려준다 — 헤더에 User-Agent, 공식 주소 한 번만", async () => {
    const f = fakeFetch({ [FED_CALENDAR_URL]: { type: "application/json", body: fixture("fed-calendar.json") } });
    const batch = await createFedCalendarSource({ fetch: f, userAgent: "test-agent/1" }).pull({ from: "2026-11-01T00:00:00Z", to: "2026-11-30T23:59:00Z" });
    expect(batch.events.map((e) => e.label)).toEqual(["FOMC 의사록 공개", "연준 베이지북"]);
    expect(batch.complete).toBe(true);
    expect(f.calls).toEqual([{ url: FED_CALENDAR_URL, userAgent: "test-agent/1" }]);
  });
});

describe("BLS · BEA ICS — 녹화 픽스처", () => {
  it("BLS: 제목을 종류·한국어 이름으로 옮기고 UID 를 외부 id 로 쓴다", async () => {
    const f = fakeFetch({ [BLS_ICS_URL]: { type: "text/calendar", body: fixture("bls-trimmed.ics") } });
    const batch = await createBlsIcsSource({ fetch: f }).pull({ from: "2026-11-01T00:00:00Z", to: "2026-11-30T23:59:00Z" });
    expect(batch.events.map((e) => [e.label, e.kind, e.startsAt])).toEqual([
      ["미국 구인·이직 조사(JOLTS)", "employment_detail", "2026-11-03T15:00:00Z"],
      ["미국 고용보고서(비농업 고용·실업률)", "employment_headline", "2026-11-06T13:30:00Z"],
      ["미국 소비자물가지수(CPI)", "inflation_headline", "2026-11-10T13:30:00Z"],
      ["미국 생산자물가지수(PPI)", "inflation_detail", "2026-11-13T13:30:00Z"],
    ]);
    expect(batch.events[2]).toMatchObject({ source: "bls-ics", externalId: "c26d524f-228b-46e9-b00e-fdbec26d68af", sourceUrl: "https://www.bls.gov/schedule/news_release/" });
  });

  it("BEA: 분기·추정 단계를 이름에 풀고 GDP 속보치만 핵심 지표로 본다", async () => {
    const f = fakeFetch({ [BEA_ICS_URL]: { type: "text/plain; charset=UTF-8", body: fixture("bea-trimmed.ics") } });
    const batch = await createBeaIcsSource({ fetch: f }).pull(WIDE);
    expect(batch.events.map((e) => [e.label, e.kind])).toEqual([
      ["미국 개인소득·지출(PCE 물가 포함)", "inflation_headline"],
      ["미국 상품·서비스 무역수지", "data_release_other"],
      ["미국 GDP 3분기 수정치", "growth_detail"],
      ["미국 GDP 4분기 속보치", "growth_headline"],
      ["미국 개인소득·지출(PCE 물가 포함)", "inflation_headline"],
    ]);
  });

  it("제목 분류 표", () => {
    expect(classifyBls("Union Membership (Annual)")).toEqual({ kind: "data_release_other", label: "Union Membership (Annual)" });
    expect(classifyBea("Gross Domestic Product, 2nd Quarter 2026 (Second Estimate)")).toEqual({ kind: "growth_detail", label: "미국 GDP 2분기 잠정치" });
    expect(classifyBea("Gross Domestic Product by State")).toEqual({ kind: "growth_detail", label: "Gross Domestic Product by State" });
    expect(classifyFed("Speeches", "x").kind).toBe("speech");
    expect(classifyFed("Testimony", "Semiannual Monetary Policy Report")?.kind).toBe("central_bank_testimony");
  });

  it("오류 응답: HTTP 403 · HTML 응답 · ICS 아님 · 0건 은 모두 실패로 끝난다(빈 값으로 덮어쓰지 않는다)", async () => {
    const blocked = fakeFetch({ [BLS_ICS_URL]: { status: 403, type: "text/html", body: "denied" } });
    await expect(createBlsIcsSource({ fetch: blocked }).pull(WIDE)).rejects.toThrow(/403/);
    const html = fakeFetch({ [BLS_ICS_URL]: { type: "text/html", body: "<html></html>" } });
    await expect(createBlsIcsSource({ fetch: html }).pull(WIDE)).rejects.toThrow(/HTML/);
    const notIcs = fakeFetch({ [BLS_ICS_URL]: { type: "text/calendar", body: "hello" } });
    await expect(createBlsIcsSource({ fetch: notIcs }).pull(WIDE)).rejects.toThrow(/ICS/);
    const empty = fakeFetch({ [BLS_ICS_URL]: { type: "text/calendar", body: "BEGIN:VCALENDAR\nEND:VCALENDAR\n" } });
    await expect(createBlsIcsSource({ fetch: empty }).pull(WIDE)).rejects.toThrow(/0건/);
  });
});

describe("공식 원천 묶음 → 수집 유스케이스 (네트워크 없음)", () => {
  const routes = (): Record<string, FakeReply> => ({
    [FED_CALENDAR_URL]: { type: "application/json", body: fixture("fed-calendar.json") },
    [BLS_ICS_URL]: { type: "text/calendar", body: fixture("bls-trimmed.ics") },
    [BEA_ICS_URL]: { type: "text/plain", body: fixture("bea-trimmed.ics") },
  });

  it("세 원천을 모두 받아 피드에 반영하고, 같은 응답으로 다시 돌리면 신규 0·그대로", async () => {
    const f = fakeFetch(routes());
    const feed = createMemoryEventFeed();
    const deps = { sources: createOfficialSources({ fetch: f }), feed, now: () => "2026-11-05T00:00:00Z" };
    const first = await collectEvents(deps, { daysBefore: 700, daysAfter: 700 });
    expect(first.sources.map((s) => [s.source, s.ok, s.report?.inserted])).toEqual([["fed-calendar", true, 5], ["bls-ics", true, 8], ["bea-ics", true, 5]]);
    const second = await collectEvents(deps, { daysBefore: 700, daysAfter: 700 });
    expect(second.sources.map((s) => [s.report?.inserted, s.report?.unchanged, s.report?.changed])).toEqual([[0, 5, 0], [0, 8, 0], [0, 5, 0]]);
    expect(f.calls.map((c) => c.url)).toHaveLength(6);
  });

  it("한 원천이 실패해도 나머지는 반영되고 실패 기록이 남는다", async () => {
    const r = routes();
    r[BLS_ICS_URL] = { status: 503, type: "text/html", body: "down" };
    const feed = createMemoryEventFeed();
    const report = await collectEvents({ sources: createOfficialSources({ fetch: fakeFetch(r) }), feed, now: () => "2026-11-05T00:00:00Z" }, { daysBefore: 700, daysAfter: 700 });
    expect(report.sources.map((s) => s.ok)).toEqual([true, false, true]);
    expect(report.sources[1]!.error).toMatch(/503/);
    expect((await feed.lastRuns()).find((x) => x.source === "bls-ics")?.ok).toBe(false);
  });

  it("원천 정보(이름·공식 페이지)는 받지 않고도 얻는다", () => {
    expect(describeOfficialSources().map((s) => s.id)).toEqual(["fed-calendar", "bls-ics", "bea-ics"]);
  });
});
