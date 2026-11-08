"use client";
// 화면 공통 오류 경계 — 어느 화면에서든 그리다 던지면 사이드바·상단은 그대로 두고 이 자리만 바뀐다.
// 「다시 시도」 는 그 구간만 다시 그린다(reset). 서버 쪽 오류는 운영 빌드에서 메시지가 가려지고 digest 만 오므로, 로그를 찾을 수 있게 digest 를 보여 준다.
import Link from "next/link";
import { useEffect } from "react";
import { Button, Notice, Page, PageHeader, Stack, Text } from "@yunseo/ui";

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[ui] 화면 오류", error);
  }, [error]);

  return (
    <Page>
      <PageHeader title="화면을 그리지 못했다" />
      <Stack gap={4}>
        <Notice>{error.digest ? "서버에서 오류가 났다. 반복되면 로그에서 아래 번호를 찾는다." : error.message || "알 수 없는 오류"}</Notice>
        {error.digest && (
          <Text tone="mute" mono>
            {error.digest}
          </Text>
        )}
        <Stack direction="row" gap={3} align="center">
          <Button variant="primary" onClick={() => reset()}>
            다시 시도
          </Button>
          <Button as={Link} href="/content" variant="ghost">
            콘텐츠로
          </Button>
        </Stack>
      </Stack>
    </Page>
  );
}
