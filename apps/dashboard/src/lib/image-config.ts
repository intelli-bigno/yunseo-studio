// 이미지 최적화 설정 한 곳 — next.config.ts(허용 목록)와 lib/media.ts(주소 만들기)가 같은 값을 쓴다.
// 목록 밖의 폭·품질로 /_next/image 를 부르면 400 이라, 둘이 어긋나지 않게 한 파일에 둔다(media.test.ts 가 확인).

/** 화면 폭에 따라 변하는 이미지(히어로 등)용 — 가정 화면 폭 구간 */
export const DEVICE_SIZES = [640, 828, 1080, 1440, 1920];

/** 폭이 정해진 이미지용(1x·2x): 썸네일 48/96, 빈 상태 일러스트 128/256, 카드 틀 448/896(= ui 틀 폭 ×1·×2) */
export const IMAGE_SIZES = [48, 96, 128, 256, 448, 896];

export const IMAGE_QUALITY = 70;
