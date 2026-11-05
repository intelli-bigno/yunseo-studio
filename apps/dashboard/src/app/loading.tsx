// 화면 전환 중 자리 표시 — 서버 렌더를 기다리지 않고 바로 다음 화면 틀로 넘어간다(탭 연타도 즉시 반응).
import { Skeleton } from "@yunseo/ui";

export default function Loading() {
  return <Skeleton rows={2} />;
}
