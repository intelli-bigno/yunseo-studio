# ops/docker — Windows WSL Docker 상주 (2026-11-05 사용자 지시)

대시보드와 워커를 windows-desktop 의 **WSL Docker** 컨테이너 하나(`yunseo-studio`)에 상주시킨다. Mac 에서는 아무것도 띄우지 않는다(ssh 터널 클라이언트만).
이 방식이 `docs/10-operations.md` 의 「Windows 네이티브 + 작업 스케줄러」를 **대체**한다(그 문서의 §2~§5 중 서비스·백업·상태 화면 동작은 그대로, 설치·실행 방식만 바뀜).

## 주소

| 어디서 | 주소 |
| --- | --- |
| Mac Studio · MacBook 브라우저(Aside) | **http://yunseo.localhost:8930** |
| Windows 안(루프백) | `http://127.0.0.1:8930` |

`*.localhost` 는 각 Mac 에서 127.0.0.1 로 풀린다 → 각 Mac 의 `127.0.0.1:8930` 이 ssh -L 터널로 windows-desktop 의 `127.0.0.1:8930`(= WSL 컨테이너)에 이어진다.
**Tailnet·LAN·인터넷에는 열지 않는다**: 컨테이너 포트는 WSL 루프백(`127.0.0.1:8930`)에만 publish 하고, 터널 리스너도 Mac 의 127.0.0.1 만 쓴다. 인증 경계는 「ssh 키로 windows-desktop 에 들어올 수 있는 기기」다(docs/10 §3 의 Tailnet 경계보다 좁다). 로그인은 여전히 없다 — 이 경계가 깨지면(포트를 0.0.0.0·Tailnet 으로 열면) 로그인을 먼저 넣는다.

근거: Chromium 계열 브라우저는 `*.localhost` 를 hosts 파일과 무관하게 루프백으로 고정한다. 그래서 Tailnet IP 로 바인드해 `yunseo.localhost` 를 쓰는 방법은 없고, 각 Mac 의 로컬 포트가 필요하다. 같은 패턴을 `bigno-studio.localhost:3150` 이 쓴다(dotfiles `scripts/bigno-studio-tunnel`).

## 구성

| 항목 | 값 |
| --- | --- |
| 이미지 | `yunseo-studio:local` (Dockerfile — `node:22-slim`(bookworm)+ffmpeg+DejaVu 서체+pnpm 11.13.1, 비루트 `node` 계정) |
| 컨테이너 | `yunseo-studio` 하나 — 안에서 대시보드(`next start`, 8930)와 워커(tsx, 8931 — 컨테이너 안 루프백 전용, publish 안 함)를 `entrypoint.sh` 가 띄운다 |
| 재시작 정책 | `restart: unless-stopped` (직접 `stop` 한 것은 데몬이 올라와도 안 켜짐) |
| 데이터 | 이름 있는 볼륨 `yunseo-studio-data` → `/data` (`studio.db`·`backups/`·`work/`). ext4 볼륨이라 SQLite WAL 이 안전하다 |
| 로그 | `docker logs`(json-file 5MB×5, 줄마다 `[worker]`·`[dashboard]` 접두사). `/status` 화면의 파일 로그 칸은 비어 있다(`YUNSEO_DATA_DIR` 미설정) |
| 워커 네트워크 | `network_mode: service:dashboard` — 워커는 컨테이너 안 `127.0.0.1:8931` 에만 열려 `assertSafeHost` 검사를 코드 수정 없이 지킨다 |
| WSL 쪽 파일 | `~/Services/yunseo-studio/{current→src-<sha>, .docker-nocreds}` (WSL ext4) |
| Git 허브 | `D:\Services\yunseo-studio\repo.git`(`deploy` 브랜치) — Mac 이 push, WSL 이 `git archive` 로 그 커밋만 뽑아 빌드 |

## 명령 (Mac 에서, 이 저장소 루트)

```bash
ops/docker/ctl.sh status                  # 컨테이너·헬스·배포 커밋
ops/docker/ctl.sh deploy                  # origin/main 배포(빌드→기동→헬스). --ref <커밋> 으로 특정 커밋/되돌리기, --dry-run
ops/docker/ctl.sh stop                    # 정지 (대시보드·워커 함께, 직접 멈춘 것은 재부팅 뒤에도 안 켜짐)
ops/docker/ctl.sh start                   # 시작 + 헬스 대기
ops/docker/ctl.sh restart
ops/docker/ctl.sh logs 100                # 최근 100줄씩
ops/docker/ctl.sh backup-now              # /data/backups 에 즉시 백업(VACUUM INTO, 14개 보존)
```

- 코드는 Git 으로만 옮긴다. 배포는 `git push`(허브) → WSL 에서 `git archive <sha>` → `docker compose build/up`. 빌드가 실패해도 실행 중인 컨테이너는 그대로다. 직전 이미지는 `yunseo-studio:prev` 로 남는다.
- 컨테이너 안 직접: `ssh windows-desktop 'wsl.exe -d Ubuntu -- docker exec yunseo-studio …'`.

## Mac 터널 (Mac 마다 1회)

```bash
bash ops/docker/mac-tunnel/install.sh            # 설치 — launchd com.bigno.yunseo-studio-tunnel (재실행 가능)
bash ops/docker/mac-tunnel/install.sh --check    # plist 문법·ssh 접속·포트 점검만
bash ops/docker/mac-tunnel/install.sh --uninstall
```

- KeepAlive 라 ssh 가 끊기면 10초 간격으로 다시 붙는다. 로그 `~/Library/Logs/yunseo-studio-tunnel/tunnel.log` — **외장 볼륨(/Volumes) 경로를 로그로 쓰지 않는다**(launchd 가 78 EX_CONFIG 로 시작조차 못 한다).
- `/bin/bash` 가 ssh 를 `exec` 한다: Mac Studio 는 `~/.ssh` 가 외장 SSD 심링크라 launchd 가 ssh 를 직접 띄우면 known_hosts 읽기가 막힌다.
- `127.0.0.1:8930` 을 다른 프로세스가 쓰면 설치가 거절된다.

## 재부팅·WSL 재시작 뒤 복귀

- 컨테이너는 `unless-stopped` — Docker Desktop(WSL 백엔드)이 올라오면 같은 정책의 다른 상주 컨테이너(postiz·bigno-studio 등)와 함께 따라 올라온다.
- 워커는 기동 1분 뒤 놓친 백업을 따라잡고, 죽은 채 남은 「실행 중」 기록은 기동 때 실패로 닫는다.
- Mac 터널은 launchd KeepAlive + RunAtLoad — Mac 재로그인·재부팅 뒤 자동. windows-desktop 이 꺼져 있는 동안은 연결 실패 로그가 쌓이다 켜지면 붙는다.

## 함정 (2026-11-05 실측)

1. **ssh 비대화 세션의 docker 자격증명 도우미 실패** — `error getting credentials … logon session does not exist`. `remote.sh` 가 빈 `DOCKER_CONFIG`(`~/Services/yunseo-studio/.docker-nocreds`)를 써서 우회한다. 베이스 이미지는 공개 이미지 `node:22-slim`(이미 받아 둔 태그)이라 자격증명이 필요 없다. 이 PC 의 docker 이미지를 `prune -a` 로 지우면 다시 못 받는다.
2. **Git Bash 경로 변환** — ssh 로 WSL 명령에 `/home/…`·`/mnt/…` 인자를 넘길 때 MSYS 가 Windows 경로로 바꾼다 → `ctl.sh` 는 `MSYS_NO_PATHCONV=1` 을 붙인다.
3. **SQLite 는 `/mnt/d`(9p)에 두지 않는다** — WAL 공유 메모리가 불안정하다. 그래서 볼륨(ext4)이다. 대가: 백업도 같은 볼륨(`/data/backups`)에 있어 Docker 디스크가 사라지면 같이 사라진다. 볼륨 밖 사본을 자동으로 만드는 작업은 아직 없다(`ctl.sh backup-now` 로 만든 사본을 필요할 때 `docker cp` 로 꺼낸다).
4. **컨테이너 둘 + `network_mode: service:` 는 쓰지 않는다** — 대시보드만 재시작되면 워커가 옛 네트워크 공간에 남아 서로 `ECONNREFUSED`(실측). 그래서 한 컨테이너 + `entrypoint.sh` 다. 또 `docker kill` 은 「직접 멈춤」으로 취급돼 재시작 정책이 안 돈다 — 크래시 복구 시험은 컨테이너 안 프로세스를 죽여서 한다.
5. **포트 8930** — 네이티브 서비스는 Tailnet IP 에 8930 을 썼다. Docker 는 루프백 8930 이라 충돌하지 않지만, 네이티브 서비스를 다시 켜지 않는다(DB 가 둘로 갈라진다).

## 네이티브 서비스 은퇴 기록 (2026-11-05)

옛 `\YunseoStudio\Dashboard·Worker` 작업과 방화벽 규칙(`YunseoStudio Tailnet 8930-8931`)을 `opsctl uninstall` 로 제거했다. `D:\Services\yunseo-studio\{app,data,repo.git}` 는 남겼다.
DB 는 정지 뒤 `opsctl backup-now` 사본(`studio-20261105-131208.db`, 무결성 ok)을 `ctl.sh import-db` 로 볼륨에 옮겼다(pieces 2·revisions 18·approvals 6 일치).
**되돌리기**: `ctl.sh stop` → `ctl.sh backup-now` → 그 사본을 `D:\Services\yunseo-studio\data\studio.db` 로 복사 → `ops/windows/deploy.sh --first-time`(네이티브 재설치). `D:\Services\yunseo-studio\data\studio.db` 는 이전 시점 사본이다.
