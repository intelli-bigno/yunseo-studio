// [릴스 편집기] 릴스 제작 — 위 큰 9:16 미리보기 + 아래 유동 패널. 프로젝트(?p=)를 SQLite(reels_projects)에서 불러온다. 편집은 전부 POST /api/reels/:id/ops.
import { notFound } from "next/navigation";
import { Page } from "@yunseo/ui";
import { listReelsSources, reelsStore } from "@/server/reels";
import { reelsOps } from "@/server/reels-ops";
import { ReelsEditor } from "./_components/ReelsEditor";

export const dynamic = "force-dynamic";

export default async function ReelsPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p } = await searchParams;
  const projects = reelsStore().list();
  const id = p ?? projects[0]?.id;
  // v2 그대로(엔진 GET) — v1 투영(loadReelsProject)으로 읽으면 속도·색·키프레임 같은 v2 편집이 새로고침에 사라진다
  const state = id ? reelsOps().getState(id) : null;
  const loaded = state?.status === 200 ? (state.body as { project: unknown; revision: number }) : null;
  if (p && !loaded) notFound();
  const sources = await listReelsSources();
  return (
    <Page>
      <ReelsEditor
        projects={projects.map((x) => ({ id: x.id, title: x.title, updatedAt: x.updatedAt }))}
        current={id && loaded ? { id, project: loaded.project, revision: loaded.revision } : null}
        sources={sources}
      />
    </Page>
  );
}
