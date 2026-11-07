"use client";
// [릴스 편집기] 편집 상태 훅 — 프로젝트·revision 을 들고, 모든 편집을 op 로 순서대로(직렬) 보낸다.
// 규칙(문서 §5): 보낸 revision 이 낡으면 409 → 서버 값을 다시 읽어 화면을 맞춘다(자동 병합 없음). 같은 클릭의 재전송은 requestId 로 멱등.
import { useCallback, useEffect, useRef, useState } from "react";
import { errorText, newClientId, postOp } from "./ops";
import { toV2 } from "./project";
import type { Clip, Op, OpSuccess, ReelsProjectV2, Track } from "./types";

export interface EditorMessage {
  tone: "alert" | "accent";
  text: string;
}

export interface Editor {
  project: ReelsProjectV2;
  revision: number;
  /** 서버가 알려준 되돌리기 가능 여부(처음엔 모른다 → 둘 다 열어 둔다) */
  undo: { available: boolean; redo: boolean };
  /** 보내는 중인 명령 수 */
  pending: number;
  message: EditorMessage | null;
  notify: (m: EditorMessage | null) => void;
  /** 명령 하나를 보낸다. 성공이면 응답, 실패(메시지는 띄움)면 null */
  send: (op: Op) => Promise<OpSuccess | null>;
}

/** return:"diff" 응답을 프로젝트에 합친다(기본 요청은 전체 프로젝트를 받으므로 거의 안 쓴다) */
export function mergeChanged(p: ReelsProjectV2, res: Pick<OpSuccess, "changed" | "effects">): ReelsProjectV2 {
  const removed = new Set(res.effects.removed);
  const byId = new Map((res.changed?.clips ?? []).map((c) => [c.id, c]));
  const clips: Clip[] = p.clips.filter((c) => !removed.has(c.id)).map((c) => byId.get(c.id) ?? c);
  for (const c of byId.values()) if (!clips.some((x) => x.id === c.id)) clips.push(c);
  const tById = new Map((res.changed?.tracks ?? []).map((t) => [t.id, t]));
  const tracks: Track[] = p.tracks.filter((t) => !removed.has(t.id)).map((t) => tById.get(t.id) ?? t);
  for (const t of tById.values()) if (!tracks.some((x) => x.id === t.id)) tracks.push(t);
  return { ...p, clips, tracks };
}

export function useEditor(projectId: string, initial: { project: ReelsProjectV2; revision: number }): Editor {
  const [project, setProject] = useState(initial.project);
  const [revision, setRevision] = useState(initial.revision);
  const [undo, setUndo] = useState({ available: true, redo: true });
  const [pending, setPending] = useState(0);
  const [message, setMessage] = useState<EditorMessage | null>(null);
  const rev = useRef(initial.revision);
  const proj = useRef(initial.project);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const client = useRef("");
  const abort = useRef<AbortController | null>(null);

  // 요청 취소 — 화면을 떠나면 진행 중인 요청을 끊는다. 개발 모드 재마운트에 대비해 효과 안에서 만든다
  useEffect(() => {
    const ctl = new AbortController();
    abort.current = ctl;
    client.current = newClientId();
    return () => ctl.abort();
  }, []);

  const apply = useCallback((p: ReelsProjectV2, r: number) => {
    proj.current = p;
    rev.current = r;
    setProject(p);
    setRevision(r);
  }, []);

  const reload = useCallback(async () => {
    const r = await fetch(`/api/reels/projects/${encodeURIComponent(projectId)}`, { signal: abort.current?.signal ?? null });
    const body = (await r.json()) as { project?: unknown; revision?: number };
    const p = toV2(body.project);
    if (r.ok && p && typeof body.revision === "number") apply(p, body.revision);
  }, [projectId, apply]);

  const run = useCallback(
    async (op: Op): Promise<OpSuccess | null> => {
      try {
        const out = await postOp(projectId, { revision: rev.current, op, clientId: client.current, requestId: crypto.randomUUID() }, abort.current?.signal);
        if (out.ok) {
          const { res } = out;
          const next = res.project ? toV2(res.project) : res.changed ? mergeChanged(proj.current, res) : null;
          if (next) apply(next, res.revision);
          else await reload();
          setUndo(res.undo);
          setMessage(res.warnings.length ? { tone: "accent", text: res.warnings.join(" · ") } : null);
          return res;
        }
        if (out.error.code === "REVISION_CONFLICT") await reload();
        setMessage({ tone: "alert", text: errorText(out.error.code, out.error.message) });
        return null;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return null;
        setMessage({ tone: "alert", text: "연결을 확인" });
        return null;
      }
    },
    [projectId, apply, reload],
  );

  const send = useCallback(
    (op: Op) => {
      setPending((n) => n + 1);
      const job = chain.current.then(() => run(op));
      chain.current = job;
      return job.finally(() => setPending((n) => n - 1));
    },
    [run],
  );

  return { project, revision, undo, pending, message, notify: setMessage, send };
}
