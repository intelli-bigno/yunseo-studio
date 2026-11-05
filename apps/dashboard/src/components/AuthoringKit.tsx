"use client";
// [L2] 쓰기 화면 공용 — 서버 액션 호출 상태(진행·오류·규칙 위반 이유)와 메시지 표시.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, CheckList, Done, Notice, Stack, Text } from "@yunseo/ui";

export type ActionOutcome = { ok: true } | { ok: false; error: string; issues: string[]; conflict: boolean };

export function useServerAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ outcome: ActionOutcome; n: number; note?: string } | null>(null);
  const run = (fn: () => Promise<ActionOutcome>, note?: string) =>
    start(async () => {
      const outcome = await fn();
      setResult((r) => ({ outcome, n: (r?.n ?? 0) + 1, ...(note ? { note } : {}) }));
      if (outcome.ok) router.refresh();
    });
  return { pending, result, run, clear: () => setResult(null) };
}

/** 마지막 실행 결과 — 성공은 짧게, 실패는 이유 목록까지 */
export function Outcome({ result }: { result: { outcome: ActionOutcome; n: number; note?: string } | null }) {
  if (!result) return null;
  const { outcome } = result;
  if (outcome.ok) return <Done key={result.n}>{result.note ?? "저장됨"}</Done>;
  return (
    <Stack gap={2}>
      <Notice>× {outcome.error}</Notice>
      {outcome.issues.length > 0 && (
        <CheckList>
          {outcome.issues.map((m) => (
            <Check key={m} ok={false}>{m}</Check>
          ))}
        </CheckList>
      )}
      {outcome.conflict && <Text size="label" tone="mute">새로 고치면 최신본 — 고친 내용은 다시 입력</Text>}
    </Stack>
  );
}
