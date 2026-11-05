// [L2] 새 편 만들기 — 3종 중 하나. 서버는 이전 편 목록만 넘기고, 만들기는 서버 액션(도메인 규칙으로 검증).
import Link from "next/link";
import { Page, PageHeader, TextLink } from "@yunseo/ui";
import { NewPieceForm } from "@/components/NewPieceForm";
import { authoring, operatorName } from "@/server/studio";

export const dynamic = "force-dynamic";

export default async function NewPiecePage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind } = await searchParams;
  const options = await authoring().listPreIssueOptions();
  const initial = kind === "post" || kind === "research" ? kind : "pre";
  return (
    <Page>
      <PageHeader meta={<TextLink as={Link} href="/content">콘텐츠</TextLink>} title="새 편" />
      <NewPieceForm preIssueOptions={options} initialKind={initial} actor={operatorName()} />
    </Page>
  );
}
