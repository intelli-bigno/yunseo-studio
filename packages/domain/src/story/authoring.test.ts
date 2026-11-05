import { describe, expect, it } from "vitest";
import {
  AUTHORING_KINDS,
  AuthoringRuleError,
  GATE_ACTIONS,
  TRANSITIONS,
  applyAction,
  applyEdit,
  availableActions,
  claimBlockers,
  confirmClaim,
  contentHash,
  deriveGates,
  g3Checklist,
  isIsoMinute,
  isSourceUrl,
  newPiece,
  transitionFor,
  validApproval,
  pieceBlockers,
  type ActionInput,
  type AuthoringKind,
} from "./authoring";
import { toContentBody } from "./document";
import { PIECE_STATUSES, type Piece, type PieceClaim } from "./model";
import { sha256Hex } from "./sha256";

const AT = "2026-11-05T10:00";
const who: ActionInput = { actor: "윤서", at: AT };
const allChecked = (kind: Piece["kind"]) => g3Checklist(kind).map(() => true);

const fact = (id: string, patch: Partial<PieceClaim> = {}): PieceClaim => ({
  id,
  mark: "fact",
  basis: "research",
  text: "발표는 11월 3일이다.",
  publisher: "기관",
  url: "https://example.org/a",
  quote: "원문 그대로",
  accessedAt: "2026-11-02",
  asOf: "2026-11-02T09:00",
  verified: false,
  ...patch,
});

/** 검증까지 갈 수 있게 다 채운 이전 편(draft) */
function readyPre(id = "P-1"): Piece {
  let p = newPiece({ id, kind: "pre", title: "사건 전", slot: "2026-11-06T21:00", viewpoint: "관점 한 문장" });
  p = applyAction(p, "select", { ...who, importance: "major" }).piece;
  p = applyAction(p, "start_draft", who).piece;
  p = applyEdit(
    p,
    {
      stages: p.stages.map((s) => ({ key: s.key, body: `${s.title} 본문` })),
      claims: [fact("c1"), { ...fact("c2"), mark: "view", basis: "experienced", url: null, quote: null, accessedAt: null, publisher: null, text: "재정 속도가 먼저 바뀐다고 본다.", basedOn: ["c1"] }],
      scenarios: [
        { id: "s1", label: "A", condition: "조건 A", reading: "읽는 법 A" },
        { id: "s2", label: "B", condition: "조건 B", reading: "읽는 법 B" },
      ],
      checks: [{ id: "k1", what: "금리", where: "재무부" }],
    },
    who,
  ).piece;
  p = confirmClaim(p, "c1", "윤서", AT);
  p = confirmClaim(p, "c2", "윤서", AT);
  return p;
}

const toApproved = (p: Piece, ctx = {}) => {
  let x = applyAction(p, "verify", who, ctx).piece;
  x = applyAction(x, "request_review", who).piece;
  return applyAction(x, "approve", { ...who, checklist: allChecked(x.kind) }).piece;
};

describe("상태 전이 표 — 전수", () => {
  const allowed = new Set(TRANSITIONS.flatMap((t) => (t.kinds ?? AUTHORING_KINDS).map((k) => `${k}|${t.from}|${t.action}`)));

  for (const kind of AUTHORING_KINDS) {
    for (const status of PIECE_STATUSES) {
      for (const action of GATE_ACTIONS) {
        const key = `${kind}|${status}|${action}`;
        it(`${key} → ${allowed.has(key) ? "허용" : "예외"}`, () => {
          const p: Piece = { ...newPiece({ id: "X", kind: kind as AuthoringKind, title: "t", slot: "2026-11-06T21:00" }), status };
          const rule = transitionFor(p, action);
          expect(rule !== null).toBe(allowed.has(key));
          if (!rule) {
            expect(() => applyAction(p, action, { ...who, reason: "r", checklist: allChecked(kind) })).toThrow(AuthoringRuleError);
            try {
              applyAction(p, action, who);
            } catch (e) {
              expect((e as AuthoringRuleError).code).toBe("transition_not_allowed");
            }
          }
        });
      }
    }
  }

  it("스토리 편은 어떤 전이도 없다", () => {
    const story = { ...newPiece({ id: "S", kind: "pre", title: "t", slot: "2026-11-06T21:00" }), kind: "story" as const };
    for (const a of GATE_ACTIONS) expect(transitionFor(story, a)).toBeNull();
  });
});

describe("게이트 조건", () => {
  it("G1: 관점·중요도·확인자 없으면 막고, watch 는 선정 불가", () => {
    const p = newPiece({ id: "P", kind: "pre", title: "t", slot: "2026-11-06T21:00" });
    expect(() => applyAction(p, "select", { actor: "", at: AT, importance: "major" })).toThrow(/핵심 관점|확인자/);
    const withView = { ...p, viewpoint: "v" };
    expect(() => applyAction(withView, "select", who)).toThrow(/중요도/);
    expect(() => applyAction(withView, "select", { ...who, importance: "watch" })).toThrow(/watch/);
    const r = applyAction(withView, "select", { ...who, importance: "major" });
    expect(r.piece.status).toBe("selected");
    expect(r.approval).toMatchObject({ gate: "G1", decision: "approved", actor: "윤서" });
    expect(r.piece.gates.G1).toBe("passed");
  });

  it("연구 편은 중요도 없이 선정", () => {
    const p = { ...newPiece({ id: "R", kind: "research", title: "t", slot: "2026-11-06T10:00" }), viewpoint: "v" };
    expect(applyAction(p, "select", who).piece.status).toBe("selected");
  });

  it("G2: 막는 이유가 있으면 예외, 다 채우면 통과하고 내용 해시를 남긴다", () => {
    const p = readyPre();
    expect(pieceBlockers(p)).toEqual([]);
    expect(deriveGates(p).G2).toBe("waiting");
    const r = applyAction(p, "verify", who);
    expect(r.piece.status).toBe("verified");
    expect(r.approval?.contentHash).toBe(contentHash(p));
    const broken = { ...p, viewpoint: "" };
    expect(() => applyAction(broken, "verify", who)).toThrow(/핵심 관점/);
  });

  it("G3: 체크리스트 전부·반려 사유 필수, 승인 해시가 편 hash 로", () => {
    const p = applyAction(applyAction(readyPre(), "verify", who).piece, "request_review", who).piece;
    expect(() => applyAction(p, "approve", { ...who, checklist: [true] })).toThrow(/체크리스트/);
    expect(() => applyAction(p, "reject", who)).toThrow(/반려 사유/);
    const rejected = applyAction(p, "reject", { ...who, reason: "표현 수정" });
    expect(rejected.piece.status).toBe("drafted");
    expect(rejected.approval).toMatchObject({ gate: "G3", decision: "rejected", note: "표현 수정" });
    const ok = applyAction(p, "approve", { ...who, checklist: allChecked("pre") }).piece;
    expect(ok.status).toBe("approved");
    expect(ok.hash).toBe(contentHash(ok).slice(0, 8));
    expect(ok.gates).toEqual({ G1: "passed", G2: "passed", G3: "passed" });
  });

  it("발행은 유효한 G3 승인이 있어야 한다", () => {
    const approved = toApproved(readyPre());
    expect(applyAction(approved, "publish", who).piece.status).toBe("published");
    const stripped = { ...approved, approvals: approved.approvals!.filter((a) => a.gate !== "G3") };
    expect(() => applyAction(stripped, "publish", who)).toThrow(/G3 승인 없음/);
  });

  it("G1 선정 버튼은 화면이 고를 중요도 때문에 막히지 않고, 관점이 없으면 막힌다", () => {
    const p = newPiece({ id: "P", kind: "pre", title: "t", slot: "2026-11-06T21:00", viewpoint: "v" });
    expect(availableActions(p)).toEqual([{ action: "select", gate: "G1", to: "selected", issues: [] }]);
    expect(availableActions({ ...p, viewpoint: "" })[0]?.issues).toEqual(["핵심 관점 한 문장 필요"]);
  });

  it("화면 버튼 목록은 상태가 허용하는 행동만 보여 준다", () => {
    const p = readyPre();
    expect(availableActions(p).map((a) => a.action)).toEqual(["verify"]);
    expect(availableActions({ ...p, status: "in_review" }).map((a) => a.action)).toEqual(["approve", "reject"]);
  });
});

describe("승인 무효화", () => {
  it("승인 뒤 본문이 바뀌면 승인은 효력을 잃고 작성 단계로 돌아간다", () => {
    const approved = toApproved(readyPre());
    expect(validApproval(approved, "G3")).not.toBeNull();
    const r = applyEdit(approved, { stages: approved.stages.map((s, i) => ({ key: s.key, body: i === 0 ? "바뀐 문장" : s.body })) }, who);
    expect(r.contentChanged).toBe(true);
    expect(r.invalidated).toEqual(["G2", "G3"]);
    expect(r.piece.status).toBe("drafted");
    expect(validApproval(r.piece, "G3")).toBeNull();
    expect(validApproval(r.piece, "G2")).toBeNull();
    expect(() => applyAction({ ...r.piece, status: "approved" }, "publish", who)).toThrow(/G3/);
  });

  it("내용이 아닌 칸(게시 예정 시각)만 바뀌면 승인은 그대로", () => {
    const approved = toApproved(readyPre());
    const r = applyEdit(approved, { slot: "2026-11-07T21:00" }, who);
    expect(r.contentChanged).toBe(false);
    expect(r.piece.status).toBe("approved");
    expect(validApproval(r.piece, "G3")).not.toBeNull();
  });

  it("발행 뒤 수정: 이유·변경 종류 필수, 상태는 발행 그대로·G3 만 무효, reapprove 로 다시 승인", () => {
    const published = applyAction(toApproved(readyPre()), "publish", who).piece;
    const patch = { viewpoint: "정정된 관점" };
    expect(() => applyEdit(published, patch, who)).toThrow(/이유 필수/);
    expect(() => applyEdit(published, patch, { ...who, reason: "오타", changeKind: "correction" })).toThrow(/독자 문구/);
    expect(() => applyEdit(published, patch, { ...who, reason: "새 자료", changeKind: "update", readerNote: "갱신" })).toThrow(/후속 게시물/);
    const r = applyEdit(published, patch, { ...who, reason: "표현만", changeKind: "clarification" });
    expect(r.piece.status).toBe("published");
    expect(r.invalidated).toEqual(["G3"]);
    expect(r.piece.gates.G3).toBe("waiting");
    expect(r.piece.blocker).toMatch(/다시 승인/);
    const again = applyAction(r.piece, "reapprove", { ...who, checklist: allChecked("pre") }).piece;
    expect(validApproval(again, "G3")).not.toBeNull();
    expect(() => applyAction(again, "reapprove", { ...who, checklist: allChecked("pre") })).toThrow(/이미/);
  });

  it("확인 표시는 편집으로 켤 수 없고, 바뀐 문장만 확인이 풀린다", () => {
    const p = readyPre();
    const forged = applyEdit(p, { claims: [...p.claims, { ...fact("c3"), verified: true, verifiedBy: "가짜" }] }, who).piece;
    expect(forged.claims.find((c) => c.id === "c3")?.verified).toBe(false);
    expect(forged.claims.find((c) => c.id === "c1")?.verified).toBe(true);
    const edited = applyEdit(p, { claims: p.claims.map((c) => (c.id === "c1" ? { ...c, text: "다른 문장 11월 4일" } : c)) }, who).piece;
    expect(edited.claims.find((c) => c.id === "c1")).toMatchObject({ verified: false, verifiedBy: null });
    expect(edited.claims.find((c) => c.id === "c2")?.verified).toBe(true);
  });
});

describe("출처·기준 시점 필수", () => {
  it("사실 문장은 URL·접근일·원문 인용·기준 시점 없이는 확인 불가", () => {
    expect(claimBlockers(fact("a", { url: null }))).toContain("출처 URL 없음");
    expect(claimBlockers(fact("a", { url: "notaurl" }))).toContain("출처 URL 형식 오류");
    expect(claimBlockers(fact("a", { accessedAt: null }))).toContain("접근일 없음");
    expect(claimBlockers(fact("a", { accessedAt: "2026-13-01" }))).toContain("접근일 형식(YYYY-MM-DD)");
    expect(claimBlockers(fact("a", { quote: " " }))).toContain("원문 인용 없음");
    expect(claimBlockers(fact("a", { asOf: null }))).toContain("기준 시점 없음");
    expect(claimBlockers(fact("a", { asOf: "2026-11-02" }))).toContain("기준 시점 형식(분 단위)");
    expect(claimBlockers(fact("a"))).toEqual([]);
  });

  it("수치·날짜가 든 조사 문장은 해석·시나리오라도 출처가 필요하고, 직접 경험은 아니다", () => {
    const scen: PieceClaim = { ...fact("s", { url: null, quote: null, accessedAt: null }), mark: "scenario", text: "금리가 4%를 넘으면" };
    expect(claimBlockers(scen)).toContain("출처 URL 없음");
    expect(claimBlockers({ ...scen, text: "금리가 오르면" })).toEqual([]);
    expect(claimBlockers({ ...scen, basis: "experienced" })).toEqual([]);
  });

  it("해석은 근거 사실 id 가 있어야 한다", () => {
    const view: PieceClaim = { ...fact("v", { url: null, quote: null, accessedAt: null }), mark: "view", basis: "experienced", text: "그렇게 본다" };
    expect(claimBlockers(view, [view])).toContain("근거 사실(based_on) 없음");
    expect(claimBlockers({ ...view, basedOn: ["zz"] }, [view])).toContain("근거 문장 없음: zz");
  });

  it("URL 은 형식만 본다(외부 접속 없음)", () => {
    expect(isSourceUrl("https://www.federalreserve.gov/x?y=1")).toBe(true);
    expect(isSourceUrl("http://example.org")).toBe(true);
    expect(isSourceUrl("ftp://example.org")).toBe(false);
    expect(isSourceUrl("https://localhost")).toBe(false);
    expect(isSourceUrl("https://exa mple.org")).toBe(false);
    expect(isIsoMinute("2026-11-05T09:30+09:00")).toBe(true);
    expect(isIsoMinute("2026-02-30T09:30")).toBe(false);
  });

  it("출처가 빠진 문장은 사람 확인도 막는다", () => {
    const p = readyPre();
    const bad = applyEdit(p, { claims: [...p.claims, fact("c9", { url: null })] }, who).piece;
    expect(() => confirmClaim(bad, "c9", "윤서", AT)).toThrow(/출처 URL 없음/);
    expect(pieceBlockers(bad).join()).toMatch(/c9: 출처 URL 없음/);
    expect(() => applyAction(bad, "verify", who)).toThrow(AuthoringRuleError);
  });

  it("본문에 수치가 있는데 출처 문장이 없으면 G2 를 막는다", () => {
    const p = readyPre();
    const noSources = applyEdit(p, { claims: [], stages: p.stages.map((s) => ({ key: s.key, body: "금리 4%" })) }, who).piece;
    expect(pieceBlockers(noSources)).toContain("본문에 수치·날짜가 있는데 출처 문장 없음");
  });
});

describe("이전 ↔ 이후 연결 무결성", () => {
  const pre = readyPre("P-9");
  const post = () => {
    let a = newPiece({ id: "A-9", kind: "post", title: "사건 후", slot: "2026-11-08T21:00", viewpoint: "대조", preIssueId: "P-9" });
    a = applyAction(a, "select", { ...who, importance: "major" }).piece;
    return applyAction(a, "start_draft", who).piece;
  };

  it("이후 편은 이전 편 시나리오 전부·확인 항목 전부에 응답해야 검증된다", () => {
    const a = applyEdit(post(), { stages: post().stages.map((s) => ({ key: s.key, body: "본문" })), evidence: { primary: true, observed: true, allScenarios: true, separated: true } }, who, { preIssue: pre }).piece;
    expect(pieceBlockers(a, { preIssue: pre })).toEqual(["이전 편 시나리오 2개 미응답", "이전 편 확인 항목 1개 미처리"]);
    const answered = applyEdit(
      a,
      { scenarioOutcomes: [{ scenarioId: "s1", outcome: "matched", note: "" }, { scenarioId: "s2", outcome: "diverged", note: "" }], checkResults: [{ checkId: "k1", status: "done", note: "" }] },
      who,
      { preIssue: pre },
    ).piece;
    expect(pieceBlockers(answered, { preIssue: pre })).toEqual([]);
    expect(applyAction(answered, "verify", who, { preIssue: pre }).piece.status).toBe("verified");
  });

  it("이전 편에 없는 id 로 응답하거나 없는 이전 편을 가리키면 저장이 막힌다", () => {
    expect(() => applyEdit(post(), { scenarioOutcomes: [{ scenarioId: "nope", outcome: "matched", note: "" }] }, who, { preIssue: pre })).toThrow(/모르는 시나리오 nope/);
    expect(() => applyEdit(post(), { preIssueId: "P-404" }, who, { preIssue: null })).toThrow(/P-404 없음/);
    expect(() => applyEdit(post(), { preIssueId: "R-1" }, who, { preIssue: { ...pre, id: "R-1", kind: "research" } })).toThrow(/이전 편이 아님/);
    expect(() => applyEdit(pre, { preIssueId: "P-1" }, who)).toThrow(/이후 편만/);
  });

  it("이후 편이 응답한 시나리오는 이전 편에서 지울 수 없다", () => {
    const linked = { ...post(), scenarioOutcomes: [{ scenarioId: "s1", outcome: "matched" as const, note: "" }] };
    expect(() => applyEdit(pre, { scenarios: [pre.scenarios![1]!] }, who, { linkedPosts: [linked] })).toThrow(/s1 는 지울 수 없음/);
    expect(applyEdit(pre, { scenarios: [pre.scenarios![0]!] }, who, { linkedPosts: [linked] }).piece.scenarios).toHaveLength(1);
  });

  it("자료 대기 → 작성은 4조건이 모두 참이어야", () => {
    let a = newPiece({ id: "A", kind: "post", title: "t", slot: "2026-11-08T21:00", viewpoint: "v" });
    a = applyAction(applyAction(a, "select", { ...who, importance: "major" }).piece, "await_evidence", who).piece;
    expect(a.blocker).toBe("자료 대기 · 조건 0/4");
    expect(() => applyAction(a, "evidence_ready", who)).toThrow(/자료 확보/);
    const ready = applyEdit(a, { evidence: { primary: true, observed: true, allScenarios: true, separated: true } }, who).piece;
    expect(applyAction(ready, "evidence_ready", who).piece.status).toBe("drafted");
  });
});

describe("내용 해시", () => {
  it("SHA-256 표준 벡터", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe("248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
    expect(sha256Hex("가나 €😀")).toBe("b621c3c186ee27ffffc4d77dc1849aff29899dab739dcb9b21e9f4fc11e6e30f"); // UTF-8 2·3·4바이트(shasum 대조)
    expect(sha256Hex("a".repeat(1000))).toHaveLength(64);
  });

  it("확인 표시·상태는 해시에 들지 않는다", () => {
    const p = readyPre();
    expect(contentHash({ ...p, status: "approved", claims: p.claims.map((c) => ({ ...c, verified: false })) })).toBe(contentHash(p));
  });
});

describe("렌더 입력(콘텐츠 정본 본문)", () => {
  it("이전 편은 pre-issue-5/v1 검증기를 통과한다", () => {
    const r = toContentBody(readyPre());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.schema).toBe("pre-issue-5/v1");
  });

  it("이전 편 시나리오가 하나뿐이면 검증기가 막는다", () => {
    const p = readyPre();
    const r = toContentBody({ ...p, scenarios: p.scenarios!.slice(0, 1) });
    expect(r.ok).toBe(false);
  });

  it("이후·연구 편은 공통 봉투", () => {
    const a = { ...newPiece({ id: "A", kind: "post", title: "t", slot: "2026-11-08T21:00", viewpoint: "v", preIssueId: "P-1" }) };
    a.stages = a.stages.map((s) => ({ ...s, body: "x" }));
    const r = toContentBody(a);
    expect(r.ok && r.kind).toBe("post-issue");
    expect(r.ok && (r.body as { links: unknown }).links).toEqual({ pre_issue_id: "P-1" });
  });
});
