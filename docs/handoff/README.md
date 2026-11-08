# YS-Studio 인수 안내 — Claude Code 로 바로 쓰기

윤서의 컴퓨터에서 **카드뉴스·릴스를 Claude Code 와 함께 만드는** 방법이다. 설치 한 번 → 대시보드 켜기 → Claude Code 에게 말로 시키기.
Claude 가 지키는 규칙은 저장소 루트의 [CLAUDE.md](../../CLAUDE.md), 전체 설계 색인은 [docs/README.md](../README.md).

## 한눈에

```
bash scripts/setup.sh        # 처음 한 번 (도구 확인 + 설치)
bash scripts/start.sh        # 대시보드 켜기 + 샘플 덱 만들기
→ 브라우저: http://127.0.0.1:8930/cards      (샘플 덱이 열린다)
→ 터미널:   claude            (저장소 폴더에서. 그다음 /new-cardnews)
```

| 화면 | 주소 | 하는 일 |
| --- | --- | --- |
| 카드 편집기 | `/cards` | 장·글·덮개·이미지·스티커 편집, PNG 내보내기 |
| 릴스 편집기 | `/reels` | 9:16 타임라인 편집, MP4+SRT 내보내기 |
| 레퍼런스 | `/references` | 모아 둔 카드 100여 장 — 고르고 비교 (내부 참고 전용) |
| 콘텐츠 | `/content` | 이슈 이전·이후·연구 3종 원고와 공정 |

## 1. 준비물

| 도구 | 필요 | 버전 | 설치 · 확인 |
| --- | --- | --- | --- |
| Git | 필수 | 아무거나 | `git --version` |
| Node.js | 필수 | **22.13 이상** (24 권장) | https://nodejs.org 의 LTS · `node -v` |
| pnpm | 필수 | 11.13.1 | `npm install -g pnpm@11.13.1` (또는 `corepack enable`) · `pnpm -v` |
| Claude Code | 필수 | 최신 | https://claude.com/claude-code 안내대로 설치 · `claude --version` |
| codex CLI | 배경 이미지 만들 때 | 최신 | `npm install -g @openai/codex` 그다음 **`codex login`** (ChatGPT 계정으로 브라우저 로그인) · `codex login status` |
| ffmpeg | 릴스 내보낼 때 | 아무거나 | mac `brew install ffmpeg` · Ubuntu/WSL `sudo apt install ffmpeg` · `ffmpeg -version` |
| Docker | 선택 (§5) | Compose v2 | 편집만 할 때는 필요 없다 |

- 지원 환경: macOS · Linux · **Windows 는 WSL(Ubuntu) 안에서** 같은 명령을 쓴다. 이 문서의 명령은 모두 bash 다. PowerShell·cmd 에서 직접 돌리는 것은 확인하지 않았다.
- 비밀번호·API 키는 필요 없다. 이미지는 codex 로그인으로 만든다.

## 2. 설치와 첫 실행

```bash
git clone <저장소 주소> yunseo-studio
cd yunseo-studio
bash scripts/setup.sh          # 도구 확인 → pnpm install → .env 만들기. 여러 번 돌려도 된다
bash scripts/start.sh          # 대시보드 켜기 (Ctrl+C 로 끝). 샘플 덱도 한 번 만든다
```

켜지면 터미널에 `준비됐다: http://127.0.0.1:8930/cards` 와 샘플 덱 주소가 나온다. 브라우저로 열면 **「샘플 덱 — YS-Studio 시작하기」** 4장이 보인다.

- 첫 화면은 컴파일 때문에 몇십 초 걸릴 수 있다. 이후는 빠르다.
- 설치만 점검하려면 `bash scripts/setup.sh --check`.
- 뒤에서 조용히 돌리려면 `bash scripts/start.sh --detach` (로그 `.data/dashboard.log`), 끄려면 `bash scripts/start.sh --stop`. Claude Code 가 서버를 켤 때 이 방식을 쓴다.
- 설정을 바꾸려면 `.env` ([.env.example](../../.env.example) 에 칸마다 설명). 포트를 바꾸면 주소의 8930 도 바뀐다.
- 내 덱·DB·렌더 결과는 모두 `.data/` 에 쌓인다 (Git 에 안 올라간다). **백업 = `.data/` 폴더 복사.**
- 서버는 이 컴퓨터(127.0.0.1)에서만 열린다. 로그인이 없으므로 같은 와이파이의 다른 기기에 열지 않는다.

## 3. Claude Code 로 쓰기

저장소 폴더에서 `claude` 를 실행하면 [CLAUDE.md](../../CLAUDE.md) 를 자동으로 읽는다. 그다음 슬래시 명령 또는 말로 시킨다.

| 명령 | 이렇게 말한다 | 결과 |
| --- | --- | --- |
| `/new-cardnews` | 「11월 FOMC 앞두고 시장이 묻는 것으로 카드뉴스 7장, 레퍼런스는 ref-001 구조로」 | 장별 구조표 확인 → 덱과 장·글·덮개 생성 |
| `/gen-background` | 「1·2·5번 장 배경 만들어줘」 | codex 로 사진 배경 생성 → 검수 → 덱에 넣기 |
| `/edit-reels` | 「이 쇼츠 앞 3초 잘라 내고 자막 넣어줘」 | 릴스 타임라인 편집 → MP4+SRT |
| `/add-reference` | 「이 핀 주소를 레퍼런스에 넣어줘」 | `refs.json` 에 항목 추가 |

권장 흐름: **① 레퍼런스 고르기 → ② 구조 맞춰 카드뉴스 생성 → ③ 배경 이미지 생성 → ④ 화면에서 다듬기 → ⑤ PNG 내보내기.**

- ①: `/references` 에서 카드를 눌러 최대 3장까지 비교한다. 마음에 든 카드의 id(`ref-001` 등)를 Claude 에게 알려 준다.
- ④⑤: 글자 크기·위치 같은 미세 조정은 화면에서 직접 한다. 끝나면 도구줄 **「내보내기 → PNG」** 로 장별 PNG 를 내려받는다. Instagram 에는 직접 올린다 (자동 게시는 없다).
- Claude 가 덱을 고치는 동안 같은 덱을 화면에서 열어 두고 고치면 저장이 `409` 로 막힌다. 덱을 다시 불러오면 된다.
- 덱을 직접 다루고 싶으면: `node scripts/studio-cards.mjs list|create|get|apply|sample` (맨 위 주석이 사용법, 명령 목록은 [카드 ops 스키마](../13-cards-ops-schema.md)).
- 샘플 덱의 원본 명령은 [sample-deck.json](sample-deck.json) — 새 덱의 템플릿으로 복사해 쓴다.

## 4. 비용 주의

| 일 | 드는 것 | 지키는 법 |
| --- | --- | --- |
| 배경 이미지 생성 (codex) | **ChatGPT/Codex 사용 한도.** 장당 차감량은 확인하지 못했다 | 처음 1~2장으로 맛보기 → 한 번에 4장 이하 → 마음에 안 들면 장면 설명을 고쳐 한 장씩 다시. 몇 장 만들지 Claude 가 먼저 말하게 한다 |
| Claude Code 대화 | Claude 사용 한도 (긴 대화·큰 파일 읽기일수록 많이 씀) | 한 편이 끝나면 `/clear` 로 새로 시작한다 |
| 대시보드·카드·릴스 편집 | 없음 (내 컴퓨터에서 돈다) | — |
| 그 밖의 유료 이미지·영상 API | **쓰지 않는다** | Claude 가 키를 요구하면 멈추고 묻는다 |

## 5. Docker 로 상시 실행 (선택)

컴퓨터를 켜 두고 항상 떠 있게 하려는 경우에만 쓴다. 편집만 할 때는 §2 로 충분하다. 이 방식은 이 문서를 쓰면서 새로 빌드해 보지 않았다(기존 운영 구성 그대로 — 미확인).

```bash
docker compose up -d --build     # 빌드는 몇 분 걸린다. 주소는 같다: http://127.0.0.1:8930
node scripts/studio-cards.mjs sample   # (선택) 샘플 덱 — 이 컴퓨터에 Node 가 있을 때
docker compose logs --tail 50    # 로그
docker compose down              # 끄기 (데이터는 볼륨 yunseo-studio-data 에 남는다)
```

- 데이터는 `.data/` 가 아니라 Docker 볼륨 `yunseo-studio-data` 에 있다. `start.sh` 로 켠 것과 DB 가 따로다 — 둘 중 하나만 쓴다.
- `compose.yaml`·`Dockerfile` 주석에 나오는 기기 이름과 절차는 원래 운영하던 환경의 기록이다. 윤서 컴퓨터에서는 무시한다.

## 자주 막히는 곳

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| `setup.sh` 가 「node 22.13 이상이 필요하다」 | Node 가 낮다 | LTS 를 새로 설치하고 터미널을 다시 연다 |
| `pnpm: command not found` | pnpm 미설치 | `npm install -g pnpm@11.13.1` |
| `start.sh` 가 「의존성이 없다」 | `setup.sh` 를 안 돌렸다 | `bash scripts/setup.sh` |
| 포트 8930 이 이미 쓰인다 / 켜지지 않는다 | 다른 프로그램, 또는 이미 켜 둔 대시보드 | `bash scripts/start.sh --stop` 후 다시. 계속되면 `.env` 의 `PORT=8931` 로 바꾸고 주소도 바꾼다 |
| 브라우저가 안 열린다 (연결 거부) | 서버가 아직 컴파일 중이거나 꺼짐 | `.data/dashboard.log` 마지막 줄 확인 (`--detach` 로 켰을 때). 180초 넘게 안 켜지면 로그를 Claude 에게 보여 준다 |
| 화면 저장이 `409` | Claude 가 같은 덱을 ops 로 고쳤다 | 덱을 다시 불러온다 (화면의 변경은 저장 전이면 사라진다 — 먼저 PNG 로 내보내 두면 안전하다) |
| 덱에 넣은 배경 이미지가 안 보인다 | 파일 이름에 밑줄·대문자·점이 있거나, `src` 가 `/api/` 로 시작하지 않는다 | 파일명을 `s1-cover.jpg` 처럼 소문자·숫자·하이픈으로. `src` 는 `/api/refs/backgrounds/<폴더>/<파일>` |
| 같은 이름으로 이미지를 다시 만들었는데 옛 그림이 보인다 | 브라우저가 5분간 기억한다 | 새 파일 이름을 쓴다 |
| `codex` 가 로그인을 요구한다 | 로그인 만료 | `codex login` (윤서가 직접). 확인 `codex login status` |
| codex 가 입력 대기에서 멈춘다 | 프롬프트를 인자로 줬다 | 프롬프트를 파일로 쓰고 `codex exec … - < 파일` 로 넣는다 ([gen-background](../../.claude/skills/gen-background/SKILL.md)) |
| 생성 이미지에 글자·얼굴·로고가 들어갔다 | 모델이 금지를 놓쳤다 | 버리고 그 장만 다시. 프롬프트 맨 끝 금지 문장을 더 구체적으로 (`no letters, no numbers`) |
| 릴스 내보내기 실패 | ffmpeg 없음, 또는 소스 파일이 없다 | `ffmpeg -version` 확인. 「원본 파일이 없는 클립」이면 소스 패널에 보이는 것만 쓴다 ([edit-reels](../../.claude/skills/edit-reels/SKILL.md)) |
| 레퍼런스를 추가했는데 안 보인다 | 서버가 목록을 기억하고 있다 | `bash scripts/start.sh --stop` 후 다시 켠다 |
| 레퍼런스 썸네일이 비어 있다 | 원 이미지 주소가 사라졌다 | 목록에서만 안 보인다. 해당 항목을 `refs.json` 에서 빼거나 새 주소로 바꾼다 |
| 내 덱이 사라졌다 | `.data/` 를 지웠거나 다른 폴더에서 켰다 | 켜는 폴더는 항상 저장소 루트. 백업이 있으면 `.data/` 를 복사해 둔다 |

그래도 안 풀리면: 오류 문장과 `.data/dashboard.log` 마지막 20줄을 Claude 에게 그대로 보여 주고 「원인 가설 3개까지만 확인해 줘」라고 한다.

## 지켜야 할 선 (요약 — 전문은 [CLAUDE.md](../../CLAUDE.md))

- Instagram·YouTube **자동 게시·계정 연동은 하지 않는다.** 결과물은 직접 올린다.
- **투자 권유·수익 보장·목표가** 같은 표현을 쓰지 않는다 (금지 표현 목록: `presets/compliance/banned-expressions.yaml`). 확인 안 된 수치·출처는 `[…]` 자리표시로 둔다.
- 레퍼런스는 **내부 참고 전용** — 구조만 따르고 사진·문구·로고는 옮기지 않는다.
- 채널명·발행 언어·최종 시각은 아직 미정이다 (결정 목록 [08-decisions.md](../08-decisions.md)). `TBD` 가 남은 카드는 게시하지 않는다.

## 확인 기록

| 항목 | 값 |
| --- | --- |
| 확인한 환경 | (아래 PR 본문의 검증 표 참고) |
