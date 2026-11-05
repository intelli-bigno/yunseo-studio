// 원천 제목 → 일정 종류·한국어 이름. 원천마다 영문 제목이 고정돼 있어 규칙표로 옮긴다(2026-11-05 실측한 제목 기준).
// 모르는 제목은 `data_release_other`(기타 통계, 자동 제안 skip) 로 두고 원문 제목을 그대로 보여 준다 — 판정은 사람이 올린다.
import type { CalendarEventKind } from "@yunseo/domain";

export interface Classified {
  kind: CalendarEventKind;
  label: string;
}

const norm = (title: string) => title.replace(/\s+/g, " ").trim();

/** BLS 발표 일정(bls.ics) 제목 */
export function classifyBls(rawTitle: string): Classified {
  const title = norm(rawTitle);
  const table: Record<string, Classified> = {
    "Consumer Price Index": { kind: "inflation_headline", label: "미국 소비자물가지수(CPI)" },
    "Employment Situation": { kind: "employment_headline", label: "미국 고용보고서(비농업 고용·실업률)" },
    "Producer Price Index": { kind: "inflation_detail", label: "미국 생산자물가지수(PPI)" },
    "U.S. Import and Export Price Indexes": { kind: "inflation_detail", label: "미국 수출입물가지수" },
    "Employment Cost Index": { kind: "employment_detail", label: "미국 고용비용지수(ECI)" },
    "Job Openings and Labor Turnover Survey": { kind: "employment_detail", label: "미국 구인·이직 조사(JOLTS)" },
    "Productivity and Costs": { kind: "data_release_other", label: "미국 생산성·단위노동비용" },
    "Real Earnings": { kind: "data_release_other", label: "미국 실질소득" },
  };
  return table[title] ?? { kind: "data_release_other", label: title };
}

const QUARTER = /Gross Domestic Product,\s*(\d)(?:st|nd|rd|th) Quarter/i;
const ESTIMATE: [RegExp, string, CalendarEventKind][] = [
  [/\(Advance Estimate\)/i, "속보치", "growth_headline"],
  [/\(Second Estimate\)/i, "잠정치", "growth_detail"],
  [/\(Third Estimate\)/i, "확정치", "growth_detail"],
  [/\(Updated Estimate\)/i, "수정치", "growth_detail"],
];

/** BEA 발표 일정(ICS) 제목 */
export function classifyBea(rawTitle: string): Classified {
  const title = norm(rawTitle);
  if (/^Gross Domestic Product/i.test(title)) {
    const quarter = QUARTER.exec(title)?.[1];
    const hit = ESTIMATE.find(([re]) => re.test(title));
    if (quarter && hit) return { kind: hit[2], label: `미국 GDP ${quarter}분기 ${hit[1]}` };
    return { kind: "growth_detail", label: title };
  }
  if (/^Personal Income and Outlays/i.test(title)) return { kind: "inflation_headline", label: "미국 개인소득·지출(PCE 물가 포함)" };
  if (/^U\.S\. International Trade in Goods and Services/i.test(title)) return { kind: "data_release_other", label: "미국 상품·서비스 무역수지" };
  return { kind: "data_release_other", label: title };
}

/** 연준 달력(calendar.json)의 type·title → 종류 */
export function classifyFed(type: string, rawTitle: string): Classified {
  const title = norm(rawTitle);
  if (type === "FOMC") {
    if (/^FOMC Meeting$/i.test(title)) return { kind: "rate_decision", label: "FOMC 정책금리 결정 발표" };
    if (/^FOMC Press Conference$/i.test(title)) return { kind: "press_conference", label: "FOMC 기자회견" };
    if (/^FOMC Minutes$/i.test(title)) return { kind: "central_bank_minutes", label: "FOMC 의사록 공개" };
    return { kind: "other", label: title };
  }
  if (type === "Beige") return { kind: "central_bank_report", label: "연준 베이지북" };
  if (type === "Testimony") return { kind: "central_bank_testimony", label: `연준 의회 증언 — ${title}` };
  // 아래는 기본 수집 대상이 아니다(fed-calendar.ts 의 types 로 넓힐 때만 쓰인다) — 자동 제안은 skip, 사람이 올린다
  if (type === "Stat") return { kind: "data_release_other", label: title };
  if (type === "Speeches") return { kind: "speech", label: title };
  return { kind: "other", label: title };
}
