// [W3 릴스] 릴스 제작 — 타임라인 편집기. 프로젝트(?p=)를 SQLite(reels_projects)에서 불러오고, 소스는 만든 쇼츠·렌더 카드.
import { notFound } from "next/navigation";
import { Page, PageHeader } from "@yunseo/ui";
import { ReelsEditor } from "@/components/ReelsEditor";
import { listReelsSources, loadReelsProject, reelsStore } from "@/server/reels";

export const dynamic = "force-dynamic";

export default async function ReelsPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p } = await searchParams;
  const projects = reelsStore().list();
  const id = p ?? projects[0]?.id;
  const loaded = id ? loadReelsProject(id) : null;
  if (p && !loaded) notFound();
  const sources = await listReelsSources();
  return (
    <Page>
      <PageHeader title="릴스 제작" />
      <ReelsEditor
        key={id ? `${id}:${loaded?.revision ?? 0}` : "none"}
        projects={projects.map((x) => ({ id: x.id, title: x.title, updatedAt: x.updatedAt }))}
        current={id && loaded ? { id, project: loaded.project, revision: loaded.revision } : null}
        sources={sources}
      />
    </Page>
  );
}
