# yunseo-studio

최윤서 투자 매거진의 Instagram 카드뉴스·YouTube Shorts 운영 대시보드 저장소.

> 컨셉: 세계의 변화와 시장을 연결하고, 다가올 사건의 파급효과를 미리 짚는 투자 매거진
> 핵심 문장: 세계의 변화에서, 시장의 다음 질문을 찾습니다.

## 상태

- 설계 문서는 [docs/](docs/README.md). 원문 브리프는 [docs/00-brief-original.md](docs/00-brief-original.md) (기존 문구 수정 금지, 덧붙이기만).
- 콘텐츠 3종(이전·이후·연구)·SOP·편성 규칙·화면 설계는 확정 문서이고, 시안(와이어프레임·시각 시스템 2안)은 [docs/design/](docs/design/README.md) 에 있다. 채널명·발행 언어·최종 시각은 미정.
- **기본 셋팅만 승인됨(2026-11-04)** — 프리셋·금지 표현 검사·모노레포 골격·콘텐츠 스키마. 게시 자동화·외부 계정 연동은 하지 않는다.
- 브랜드 이름·캐릭터·발행 언어는 **미정**이다. 값이 `TBD` 인 항목이 남아 있으면 게시 단계에서 차단한다.
- 비공개(private) 저장소. 비밀값·계정 정보를 커밋하지 않는다.

## 명령

```
pnpm install
pnpm run check      # lint + typecheck + test
pnpm run validate   # 프리셋·콘텐츠 검증 (--publish: 자리표시자가 남으면 실패)
```
