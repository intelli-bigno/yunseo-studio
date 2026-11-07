// [W5 릴스] 편집 명령 유스케이스 — POST /api/reels/:id/ops 의 본체(docs/12 §2·§5).
// 라우트는 JSON 을 넘기고 { status, body } 를 받아 그대로 돌려준다. 읽기 → 멱등 확인 → revision 확인 → 적용 → 검사 → 저장(+op 로그)만 한다.
import {
  applyCommand,
  diffProjects,
  migrateV1toV2,
  toProjectV1,
  ReelsOpError,
  toProjectV2,
  undoState,
  type OpContext,
  type OpLogEntry,
  type ReelsOp,
  type ReelsProjectV2,
  type V1Project,
  type SpeechSegment,
} from "@yunseo/domain";

export interface ReelsOpRow {
  revision: number;
  opId: string;
  clientId: string | null;
  kind: "do" | "undo" | "redo";
  steps: number;
  /** JSON 문자열 */
  op: string;
  forward: string;
  inverse: string;
  createdAt: string;
}

export interface ReelsOpCommit {
  projectId: string;
  expectedRevision: number;
  title: string;
  data: string;
  opId: string;
  clientId: string | null;
  requestId: string | null;
  kind: "do" | "undo" | "redo";
  steps: number;
  op: string;
  forward: string;
  inverse: string;
  /** 멱등 재생용 — 성공 응답 JSON */
  response: string;
}

export interface ReelsOpsRepo {
  get(id: string): { id: string; title: string; data: string; revision: number } | null;
  /** sinceRevision 보다 뒤 로그(오름차순) */
  log(id: string, sinceRevision?: number): ReelsOpRow[];
  findResponse(id: string, requestId: string, sinceIso: string): string | null;
  /** expectedRevision 일 때만 프로젝트를 바꾸고 로그를 붙인다 */
  commit(c: ReelsOpCommit): { ok: true; revision: number } | { ok: false; current: number };
}

export interface ReelsOpsDeps {
  repo: ReelsOpsRepo;
  /** 원본 목록·LUT 목록 등 적용기 문맥 — op 를 받아 그 안에 나온 원본만 재도 된다 */
  context(op: ReelsOp): Promise<Omit<OpContext, "speech">> | Omit<OpContext, "speech">;
  /** auto_place_subtitles 가 있을 때만 부른다 — 음성 클립 원본의 말소리 구간(원본 ms) */
  measureSpeech?(project: ReelsProjectV2, clipId: string, silence: { noiseDb: number; minMs: number }): Promise<SpeechSegment[] | undefined>;
  now?(): Date;
}

export interface ReelsOpsResponse {
  status: number;
  body: Record<string, unknown>;
}

export const REELS_REQUEST_TTL_MS = 24 * 60 * 60 * 1000;
export const REELS_OPS_MAX_BYTES = 1_000_000;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const entryOf = (r: ReelsOpRow): OpLogEntry => ({ kind: r.kind, ...(r.steps > 1 ? { steps: r.steps } : {}), forward: JSON.parse(r.forward), inverse: JSON.parse(r.inverse) });
const opIdOf = (revision: number) => `op-${String(revision).padStart(6, "0")}`;

function speechTargets(op: unknown): { clipId: string; silence: { noiseDb: number; minMs: number } }[] {
  if (!isObj(op)) return [];
  if (op.op === "batch" && Array.isArray(op.ops)) return op.ops.flatMap(speechTargets);
  if (op.op !== "auto_place_subtitles" || typeof op.audioClipId !== "string") return [];
  const s = isObj(op.silence) ? op.silence : {};
  return [{ clipId: op.audioClipId, silence: { noiseDb: typeof s.noiseDb === "number" ? s.noiseDb : -38, minMs: typeof s.minMs === "number" ? s.minMs : 100 } }];
}

export function createReelsOpsUseCases(deps: ReelsOpsDeps) {
  const now = deps.now ?? (() => new Date());
  const fail = (e: ReelsOpError, revision?: number): ReelsOpsResponse => ({ status: e.status, body: { error: e.toBody(), ...(revision !== undefined ? { revision } : {}) } });

  return {
    /** GET — 현재 상태(v1 이면 v2 로 바꿔 보여 준다). since 를 주면 그 뒤 op 로그도 */
    getState(id: string, since?: number): ReelsOpsResponse {
      const rec = deps.repo.get(id);
      if (!rec) return fail(new ReelsOpError("PROJECT_NOT_FOUND", `${id} 없음`));
      const log = deps.repo.log(id);
      const body: Record<string, unknown> = { id, revision: rec.revision, project: toProjectV2(JSON.parse(rec.data)), undo: undoState(log.map(entryOf)) };
      if (since !== undefined)
        body.ops = log.filter((r) => r.revision > since).map((r) => ({ revision: r.revision, opId: r.opId, clientId: r.clientId, kind: r.kind, op: JSON.parse(r.op), createdAt: r.createdAt }));
      return { status: 200, body };
    },

    /**
     * PUT 통째 저장(docs/12 §5) — v1 판을 v2 로 올려 바꾸고 op 로그에 {op:"replace_project"} 로 남긴다(undo 가능).
     * 지금 판에 v1 로 담을 수 없는 v2 편집이 있으면 덮어쓰면 잃으므로 409 LOSSY_OVERWRITE.
     */
    replaceProject(id: string, project: V1Project, expectedRevision: number, clientId: string | null = null): ReelsOpsResponse {
      const rec = deps.repo.get(id);
      if (!rec) return fail(new ReelsOpError("PROJECT_NOT_FOUND", `${id} 없음`));
      if (expectedRevision !== rec.revision) return fail(new ReelsOpError("REVISION_CONFLICT", `revision ${expectedRevision} 이 낡았다(현재 ${rec.revision})`), rec.revision);
      let cur: ReelsProjectV2;
      try {
        cur = toProjectV2(JSON.parse(rec.data));
      } catch (e) {
        if (e instanceof ReelsOpError) return fail(e, rec.revision);
        throw e;
      }
      if (!toProjectV1(cur).lossless)
        return fail(new ReelsOpError("LOSSY_OVERWRITE", "v1 통째 저장으로 담을 수 없는 v2 편집이 있다 — ops 로 고친다"), rec.revision);
      const next: ReelsProjectV2 = { ...migrateV1toV2(project), canvas: cur.canvas };
      const forward = diffProjects(cur, next);
      const inverse = diffProjects(next, cur);
      const revision = rec.revision + 1;
      const opId = opIdOf(revision);
      const undo = undoState([...deps.repo.log(id).map(entryOf), { kind: "do", forward, inverse }]);
      const body = { id, revision, opId, undo };
      const saved = deps.repo.commit({
        projectId: id,
        expectedRevision: rec.revision,
        title: next.title,
        data: JSON.stringify(next),
        opId,
        clientId,
        requestId: null,
        kind: "do",
        steps: 1,
        op: JSON.stringify({ op: "replace_project" }),
        forward: JSON.stringify(forward),
        inverse: JSON.stringify(inverse),
        response: JSON.stringify(body),
      });
      if (!saved.ok) return fail(new ReelsOpError("REVISION_CONFLICT", `저장 중 다른 곳이 먼저 고쳤다(현재 ${saved.current})`), saved.current);
      return { status: 200, body };
    },

    /** POST — op 하나(batch 포함) 적용 */
    async postOp(id: string, raw: unknown, rawBytes = 0): Promise<ReelsOpsResponse> {
      if (rawBytes > REELS_OPS_MAX_BYTES) return fail(new ReelsOpError("TOO_LARGE", "요청이 1MB 를 넘는다"));
      if (!isObj(raw) || typeof raw.revision !== "number" || !isObj(raw.op)) return fail(new ReelsOpError("BAD_REQUEST", "revision(숫자)·op(객체)가 필요하다"));
      const rec = deps.repo.get(id);
      if (!rec) return fail(new ReelsOpError("PROJECT_NOT_FOUND", `${id} 없음`));
      const requestId = typeof raw.requestId === "string" && raw.requestId ? raw.requestId.slice(0, 100) : null;
      const clientId = typeof raw.clientId === "string" && raw.clientId ? raw.clientId.slice(0, 100) : null;
      if (requestId) {
        // 멱등 — revision 검사보다 먼저 본다
        const prev = deps.repo.findResponse(id, requestId, new Date(now().getTime() - REELS_REQUEST_TTL_MS).toISOString());
        if (prev) return { status: 200, body: JSON.parse(prev) };
      }
      if (raw.revision !== rec.revision) return fail(new ReelsOpError("REVISION_CONFLICT", `revision ${raw.revision} 이 낡았다(현재 ${rec.revision})`), rec.revision);
      const op = raw.op as ReelsOp;
      try {
        const project = toProjectV2(JSON.parse(rec.data));
        const base = await deps.context(op);
        const speech = new Map<string, SpeechSegment[] | undefined>();
        for (const t of speechTargets(op)) if (!speech.has(t.clipId) && deps.measureSpeech) speech.set(t.clipId, await deps.measureSpeech(project, t.clipId, t.silence));
        const ctx: OpContext = { ...base, speech: (clipId) => speech.get(clipId) };
        const r = applyCommand(project, deps.repo.log(id).map(entryOf), op, ctx);
        const revision = rec.revision + 1;
        const opId = opIdOf(revision);
        const full = { revision, opId, effects: r.effects, project: r.project, warnings: r.warnings, undo: r.undo };
        const body: Record<string, unknown> =
          raw.return === "diff" ? { revision, opId, effects: r.effects, changed: { clips: r.forward.upsert, tracks: r.forward.tracks ?? [] }, warnings: r.warnings, undo: r.undo } : full;
        if (raw.dryRun === true) return { status: 200, body: { ...body, revision: rec.revision, dryRun: true } };
        const saved = deps.repo.commit({
          projectId: id,
          expectedRevision: rec.revision,
          title: r.project.title,
          data: JSON.stringify(r.project),
          opId,
          clientId,
          requestId,
          kind: r.entry.kind,
          steps: r.entry.steps ?? 1,
          op: JSON.stringify(op),
          forward: JSON.stringify(r.entry.forward),
          inverse: JSON.stringify(r.entry.inverse),
          response: JSON.stringify(body),
        });
        if (!saved.ok) return fail(new ReelsOpError("REVISION_CONFLICT", `저장 중 다른 곳이 먼저 고쳤다(현재 ${saved.current})`), saved.current);
        return { status: 200, body };
      } catch (e) {
        if (e instanceof ReelsOpError) return fail(e, rec.revision);
        throw e;
      }
    },
  };
}

export type ReelsOpsUseCases = ReturnType<typeof createReelsOpsUseCases>;
