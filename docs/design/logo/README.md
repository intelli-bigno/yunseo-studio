# YS-Studio 로고 SOP (2026-11-07)

1. 프롬프트: [prompt.md](prompt.md)(공통) + 변형 4종 → `candidates/p-*.txt` 원문 그대로.
2. 생성: `codex exec --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check --json - < candidates/p-X.txt` 4개 병렬(codex `image_generate`). 원본 1024px → 512px 로 줄여 보관(`candidates/cand-*.png`).
3. 선택: **B — 얇은 사각 틀 안 기하 산세리프 Y·S 모노그램, 황동 가로선 하나** → [selected.png](selected.png)
   - A·C·D 는 세리프 Y/S 겹침이라 특정 패션 하우스 모노그램과 닮아 보이고, 16px 에서 가는 세리프가 뭉개진다.
   - B 는 틀이 실루엣을 사각으로 고정해 파비콘·앱 아이콘 칸에 꽉 차고, 굵은 산세리프라 작게도 읽힌다. 색도 Ink & Brass 토큰(잉크·아이보리·황동)과 같다.
4. 적용(`sips -Z`): `apps/dashboard/public/icon.png`(64, 파비콘·헤더) · `apple-icon.png`(180) · `icon-192/512.png`(manifest).
5. SVG 트레이스: 생략 — 이 기기에 potrace 가 없고 PNG 로 모든 칸이 충분하다. 필요하면 `potrace` 설치 뒤 selected.png 에서 만든다.
