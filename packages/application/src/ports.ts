// 포트(인터페이스) — 유스케이스가 부르는 바깥 세계의 모양. 어댑터가 구현하고 apps 가 조립한다(04 의존 규칙 3·4).
// 저장소는 비동기 계약이다: 지금은 로컬 SQLite 라 동기로 끝나지만, 다른 저장소(Postgres 등)로 바꿔도 유스케이스는 그대로다.
import type { EventCandidate, Piece, QueueItem, WeekVariable } from "@yunseo/domain";

export interface StudioRepository {
  listPieces(): Promise<readonly Piece[]>;
  getPiece(id: string): Promise<Piece | null>;
  listWeekVariables(): Promise<readonly WeekVariable[]>;
  listEventCandidates(): Promise<readonly EventCandidate[]>;
  listQueue(): Promise<readonly QueueItem[]>;
  /** 쓰기마다 오르는 숫자 — 읽기 캐시가 「언제 낡았는지」를 값싸게 안다(read-cache.ts) */
  revision(): Promise<number>;
}

/** 오늘 날짜(YYYY-MM-DD, 운영 시간대 기준). 테스트·시안 데이터에서는 고정값을 주입한다 */
export interface Clock {
  today(): string;
}

/** 카드 미리보기 이미지 묶음 */
export interface CardSet {
  id: "v2" | "a";
  label: string;
  names: string[];
  aspect: string; // CSS aspect-ratio
}

export interface CardImage {
  bytes: Uint8Array;
  contentType: string;
  /** 내용이 바뀌면 바뀌는 값 — 조건부 요청(304)에 쓴다 */
  etag: string;
}

export interface CardAssets {
  activeSet(): Promise<CardSet>;
  /** 허용된 이름만 읽는다. 모르는 이름·없는 파일은 null */
  read(name: string): Promise<CardImage | null>;
}
