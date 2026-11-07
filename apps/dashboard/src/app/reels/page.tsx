// 릴스 제작 — 편집기는 다음 단계에서 올린다. 지금은 자리만 잡은 빈 화면.
import { Card, EmptyState, Page, PageHeader } from "@yunseo/ui";

export default function ReelsPage() {
  return (
    <Page>
      <PageHeader title="릴스 제작" />
      <Card>
        <EmptyState title="준비 중" />
      </Card>
    </Page>
  );
}
