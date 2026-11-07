// 시작 화면은 콘텐츠다 — 오늘·편성·발행·성과·운영 탭은 없앴다(2026-11-07).
import { redirect } from "next/navigation";

export default function HomePage(): never {
  redirect("/content");
}
