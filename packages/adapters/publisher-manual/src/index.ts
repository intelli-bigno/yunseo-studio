// 어댑터 계층: publisher-manual — 업로드 묶음(zip) 생성 [L2]. API 없이도 동작하는 기본 게시기(게시 자체는 사람이 한다, D2).
export * from "./upload-packager";
export { writeZip, type ZipEntry } from "./zip";
