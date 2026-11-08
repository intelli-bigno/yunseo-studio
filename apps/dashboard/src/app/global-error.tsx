"use client";
// 루트 레이아웃 자체가 던졌을 때의 마지막 경계 — 레이아웃을 대신하므로 문서 뼈대(html·body)와 스타일을 직접 건다.
// 여기까지 오면 사이드바 숫자를 모으던 DB 읽기 같은 공통 준비가 실패한 것이다. 다시 시도하면 레이아웃부터 다시 그린다.
import { useEffect } from "react";
import { cssText } from "@yunseo/design-tokens";
import { Button, Html, Notice, Page, PageHeader, Stack, Text } from "@yunseo/ui";
import "@yunseo/ui/styles.css";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[ui] 루트 오류", error);
  }, [error]);

  return (
    <Html fonts={[]} head={<style>{cssText()}</style>}>
      <Page>
        <PageHeader title="YS-Studio 를 열지 못했다" />
        <Stack gap={4}>
          <Notice>서버를 준비하다 오류가 났다. 잠시 뒤 다시 시도한다.</Notice>
          {error.digest && (
            <Text tone="mute" mono>
              {error.digest}
            </Text>
          )}
          <Stack direction="row" gap={3}>
            <Button variant="primary" onClick={() => reset()}>
              다시 시도
            </Button>
          </Stack>
        </Stack>
      </Page>
    </Html>
  );
}
