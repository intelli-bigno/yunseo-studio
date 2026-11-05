"use server";
// 편성 화면의 쓰기 동작(서버 액션) — 사람의 판정·수동 입력. 판정 규칙은 유스케이스/도메인이 지키고 여기는 입력을 옮기기만 한다.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { EVENT_IMPORTANCE, type EventImportance } from "@yunseo/domain";
import { events } from "@/server/studio";

interface Result {
  ok: boolean;
  errors: string[];
}

const toResult = (r: { ok: true } | { ok: false; errors: string[] }): Result => (r.ok ? { ok: true, errors: [] } : { ok: false, errors: r.errors });

function refresh(): void {
  revalidatePath("/schedule");
  revalidatePath("/");
}

export async function decideEventAction(eventId: string, decision: string, reason: string): Promise<Result> {
  if (!(EVENT_IMPORTANCE as readonly string[]).includes(decision)) return { ok: false, errors: ["알 수 없는 판정"] };
  const res = toResult(await events().decideEvent({ eventId, decision: decision as EventImportance, reason }));
  if (res.ok) refresh();
  return res;
}

export async function clearDecisionAction(eventId: string): Promise<Result> {
  const res = toResult(await events().clearDecision(eventId));
  if (res.ok) refresh();
  return res;
}

const field = (data: FormData, name: string): string => {
  const v = data.get(name);
  return typeof v === "string" ? v : "";
};

/** 수동 입력 — 성공이면 완료 표시, 실패면 사유를 쿼리로 돌려 같은 화면에 보인다 */
export async function addManualEventAction(data: FormData): Promise<void> {
  const res = await events().addManualEvent({
    title: field(data, "title"),
    date: field(data, "date"),
    time: field(data, "time"),
    kind: field(data, "kind"),
    sourceUrl: field(data, "sourceUrl"),
    note: field(data, "note"),
  });
  if (!res.ok) redirect(`/schedule/events?error=${encodeURIComponent(res.errors.join(" · "))}`);
  refresh();
  revalidatePath("/schedule/events");
  redirect("/schedule/events?saved=1");
}

export async function removeManualEventAction(data: FormData): Promise<void> {
  const res = await events().removeManualEvent(field(data, "id"));
  if (!res.ok) redirect(`/schedule/events?error=${encodeURIComponent(res.errors.join(" · "))}`);
  refresh();
  revalidatePath("/schedule/events");
  redirect("/schedule/events");
}
