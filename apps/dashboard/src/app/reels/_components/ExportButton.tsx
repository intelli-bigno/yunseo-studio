"use client";
// 렌더 버튼 — 지금 판을 서버(ffmpeg)에서 1080x1920 MP4 + SRT 로 만들고, 끝나면 보기·받기 링크를 보여 준다. 편집 명령이 아니라서 되돌리기에 안 들어간다.
import { useEffect, useRef, useState } from "react";
import { Button, Notice, Stack, Text, TextLink } from "@yunseo/ui";
import { isRetryableStatus } from "@yunseo/domain";
import { exportFileUrl, exportSummary, requestExport, type ExportResult } from "../_lib/export";

export function ExportButton({ projectId, empty, pending }: { projectId: string; empty: boolean; pending: boolean }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<ExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** 서버·연결 쪽 실패면 같은 요청을 다시 보내 볼 만하다(입력·규칙 오류는 같은 결과) */
  const [retryable, setRetryable] = useState(false);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    const ctl = new AbortController();
    abort.current = ctl;
    return () => ctl.abort();
  }, []);

  const run = async () => {
    setBusy(true);
    setError(null);
    setRetryable(false);
    setDone(null);
    try {
      const out = await requestExport(projectId, abort.current?.signal);
      if (out.ok) setDone(out.res);
      else {
        setError(out.message);
        setRetryable(isRetryableStatus(out.status));
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        setError("렌더 실패");
        setRetryable(true);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack direction="row" gap={3} align="center" wrap>
      <Button variant="primary" onClick={() => void run()} disabled={busy || pending || empty} title={pending ? "편집 저장 중" : "지금 판을 MP4 로 만든다"}>
        {busy ? "렌더 중…" : "렌더"}
      </Button>
      {error && <Notice>{error}</Notice>}
      {error && retryable && (
        <Button variant="ghost" onClick={() => void run()} disabled={busy}>
          다시 시도
        </Button>
      )}
      {done && (
        <>
          <Text tone="mute" mono>{exportSummary(done)}</Text>
          <TextLink href={exportFileUrl(projectId, done.revision, "video")} target="_blank" rel="noreferrer">보기</TextLink>
          <TextLink href={exportFileUrl(projectId, done.revision, "video", true)}>MP4 받기</TextLink>
          <TextLink href={exportFileUrl(projectId, done.revision, "srt", true)}>SRT 받기</TextLink>
          {done.warnings.length > 0 && <Notice tone="accent">{done.warnings.join(" · ")}</Notice>}
        </>
      )}
    </Stack>
  );
}
