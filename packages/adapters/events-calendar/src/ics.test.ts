import { describe, expect, it } from "vitest";
import { fixture } from "./fixtures";
import { parseIcs } from "./ics";
import { zonedToUtc } from "./time-zone";

describe("시간대 변환 (서머타임 포함)", () => {
  it("미 동부 8:30 — 겨울(EST)은 13:30Z, 여름(EDT)은 12:30Z", () => {
    expect(zonedToUtc(2026, 11, 10, 8, 30, "America/New_York")).toBe("2026-11-10T13:30:00Z");
    expect(zonedToUtc(2026, 3, 11, 8, 30, "America/New_York")).toBe("2026-03-11T12:30:00Z");
  });
  it("전환 당일 경계: 서머타임이 끝나는 11월 첫 일요일 새벽도 하루 전과 다르게 계산한다", () => {
    expect(zonedToUtc(2026, 11, 1, 12, 0, "America/New_York")).toBe("2026-11-01T17:00:00Z"); // 전환 뒤(EST)
    expect(zonedToUtc(2026, 10, 31, 12, 0, "America/New_York")).toBe("2026-10-31T16:00:00Z"); // 전환 전(EDT)
  });
  it("서울은 +9, 모르는 시간대는 null", () => {
    expect(zonedToUtc(2026, 11, 5, 9, 0, "Asia/Seoul")).toBe("2026-11-05T00:00:00Z");
    expect(zonedToUtc(2026, 11, 5, 9, 0, "Mars/Olympus")).toBeNull();
  });
});

describe("ICS 읽기", () => {
  it("BLS 녹화본(LF, TZID=US-Eastern): 8건, 겨울·여름 시각을 UTC 로", () => {
    const { events, warnings } = parseIcs(fixture("bls-trimmed.ics"));
    expect(warnings).toEqual([]);
    expect(events).toHaveLength(8);
    const cpiNov = events.find((e) => e.startsAt.startsWith("2026-11-10"))!;
    expect(cpiNov).toMatchObject({ uid: "c26d524f-228b-46e9-b00e-fdbec26d68af", summary: "Consumer Price Index", startsAt: "2026-11-10T13:30:00Z", timeKnown: true, location: "Washington, DC", categories: ["IMPORTANT", "BLS"] });
    expect(events.find((e) => e.startsAt.startsWith("2026-03-11"))!.startsAt).toBe("2026-03-11T12:30:00Z");
  });

  it("BEA 녹화본(CRLF, 줄 접기, Z 시각): 접힌 제목을 이어 붙이고 이스케이프를 푼다", () => {
    const { events, warnings } = parseIcs(fixture("bea-trimmed.ics"));
    expect(warnings).toEqual([]);
    expect(events.map((e) => e.summary)).toEqual([
      "Personal Income and Outlays, October 2026",
      "U.S. International Trade in Goods and Services, September 2026",
      "Gross Domestic Product, 3rd Quarter 2025 (Updated Estimate), GDP by Industry, and Corporate Profits (Revised)",
      "Gross Domestic Product, 4th Quarter and Year 2024 (Advance Estimate)",
      "Personal Income and Outlays, November 2027",
    ]);
    expect(events[0]).toMatchObject({ startsAt: "2026-11-25T13:30:00Z", sequence: 0 });
    expect(events[2]!.sequence).toBe(4);
    expect(events[3]!.startsAt).toBe("2025-01-30T13:30:00Z"); // DTSTART;VALUE=DATE-TIME:…Z 변형
  });

  it("LF 로 바꿔도 CRLF 와 같은 결과", () => {
    const crlf = parseIcs(fixture("bea-trimmed.ics")).events;
    const lf = parseIcs(fixture("bea-trimmed.ics").replace(/\r\n/g, "\n")).events;
    expect(lf).toEqual(crlf);
  });

  it("날짜만 있는 일정(VALUE=DATE)은 시각을 모르는 일정으로 읽는다", () => {
    const ics = ["BEGIN:VCALENDAR", "BEGIN:VEVENT", "UID:d1", "DTSTART;VALUE=DATE:20261103", "SUMMARY:Election Day", "END:VEVENT", "END:VCALENDAR"].join("\n");
    expect(parseIcs(ics).events).toEqual([{ uid: "d1", summary: "Election Day", startsAt: "2026-11-03T00:00:00Z", timeKnown: false, categories: [], location: "", sequence: 0 }]);
  });

  it("시작 시각이 없거나 시간대를 모르는 항목은 건너뛰고 경고한다", () => {
    const ics = [
      "BEGIN:VEVENT", "UID:a", "SUMMARY:no start", "END:VEVENT",
      "BEGIN:VEVENT", "UID:b", "DTSTART:20261103T100000", "SUMMARY:floating", "END:VEVENT",
      "BEGIN:VEVENT", "UID:c", "DTSTART;TZID=Mars/Olympus:20261103T100000", "SUMMARY:unknown tz", "END:VEVENT",
      "BEGIN:VEVENT", "UID:ok", "DTSTART:20261103T100000Z", "SUMMARY:ok", "END:VEVENT",
    ].join("\n");
    const out = parseIcs(ics);
    expect(out.events.map((e) => e.uid)).toEqual(["ok"]);
    expect(out.warnings).toHaveLength(3);
  });

  it("ICS 가 아닌 본문은 일정 0건", () => {
    expect(parseIcs("<html>not ics</html>").events).toEqual([]);
  });
});
