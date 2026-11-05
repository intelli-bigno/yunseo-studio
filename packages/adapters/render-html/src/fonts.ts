// [L7] 저장소에 둔 서체(Pretendard, SIL OFL 1.1 — fonts/Pretendard-OFL.txt). 카드 렌더와 릴스 자막(L3 fontsDir)이 같은 파일을 쓴다.
// 시스템 서체를 설치하지 않는다. 번들러(Next)를 거치는 곳(대시보드 조립부)은 pretendardDir() 대신 저장소 기준 경로를 직접 넘긴다.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const PRETENDARD_FAMILY = "Pretendard";

/** fonts/ 폴더의 절대 경로. 부를 때 계산한다 — 폴더 URL 은 번들러가 풀지 못하므로 실제 파일 하나를 가리켜 그 폴더를 쓴다 */
export const pretendardDir = (): string => dirname(fileURLToPath(new URL("../fonts/Pretendard-Regular.woff", import.meta.url)));
