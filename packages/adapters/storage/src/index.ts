// 어댑터 계층: storage — application 의 StudioRepository(읽기)·AuthoringStore(쓰기, [L2]) 포트를 SQLite 로 구현한다.
export * from "./sqlite-studio-repository";
export { MIGRATIONS, SCHEMA_VERSION, migrate } from "./migrations";
export { SEED_TODAY } from "./seed";
export { createReelsProjectStore, ReelsRevisionConflictError, REELS_PROJECTS_DDL, type ReelsProjectRecord, type ReelsProjectStore, type ReelsProjectSummary } from "./reels-projects"; // [W3 릴스] 레인 전용 테이블
