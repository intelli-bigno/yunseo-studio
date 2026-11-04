# 카드 v2 배경 이미지 스타일 바이블 (초안 · 이 회차 전용)

brand-image-gen 스킬의 Layer 1 고정부다. 같은 회차의 모든 배경 이미지 프롬프트가 아래 영문 프리픽스를 **글자 그대로** 공유한다(배치 간 톤·색 일관성). 채널 브랜드(결정 D5·D13)가 정해지면 이 문서를 브랜드 바이블로 승격한다.

## 인상 (브랜딩 이론 → 한 줄)

차분함 · 안목 · 신뢰감. 소리 지르지 않는 다큐멘터리 사진. 장면은 사건(미 중간선거)을 **암시**할 뿐 누구의 편도 들지 않는다.

## 4칸

| 칸 | 값 |
| --- | --- |
| 팔레트 | 슬레이트 블루·딥 네이비(그림자) `#12202F`–`#2B3A4D` · 따뜻한 황동빛 앰버(단일 광원) `#D6A86A` · 오프화이트(하이라이트) `#EDE6D8`. 채도 낮게. 카드 강조색(말풍선 답)은 같은 앰버 계열 `#CDA46B` |
| 톤 | 블루아워의 다큐 사진, 얕은 심도, 필름 입자, HDR·과장 대비 없음 |
| 모티프 | 의사당 건축 · 투표 손(얼굴 없음) · 어두운 모니터의 빛 · 세 갈래 문 · 신문 · 갈라지는 물길 · 빈 노트와 펜 |
| 금지 | 읽히는 글자·숫자·로고·워터마크 · 깃발·정당 상징·정당색(빨강/파랑 대립) · 실존 인물·식별 가능한 얼굴 · 숫자 든 차트 · 네온·일러스트·3D 렌더·렌즈 플레어·강한 비네팅 |

## 구도 규칙 (글이 이미지 위에 올라가는 카드용)

- 세로 2:3 로 생성 → 1080×1350(4:5)에 `cover` 로 앉힌다. 주 피사체는 **위쪽 2/3**, 아래 1/3 은 조용하고 어둡게(글 자리).
- 카드에서 아래쪽에 딥 네이비 그라데이션을 한 번 더 깔아 글 대비를 확보한다(이미지 자체를 믿지 않는다).

## 고정 프리픽스 (영문, 모든 세션 동일)

```
STYLE BIBLE (apply to every image, identically):
Documentary editorial photograph, photorealistic, full-frame camera, 35-50mm lens, shallow depth of field.
Restrained blue-hour color grade: cool slate-blue and deep navy shadows (#12202F to #2B3A4D), a single warm amber light source (#D6A86A) as the only warm accent, off-white highlights (#EDE6D8). Low saturation, soft film grain, gentle contrast, no HDR.
Mood: calm, discerning, trustworthy - quiet confidence, no drama, no alarm.
Format: vertical portrait, 2:3. Composition: the main subject sits in the upper two-thirds; the bottom third is calm, low-detail and darker (it will carry text).
NEVER include: any readable text, letters or numbers, logos, watermarks, flags, party symbols or partisan red/blue color coding, identifiable real people or faces, charts with numbers, neon, illustration or cartoon look, 3D-render look, lens flare, heavy vignette.
```
