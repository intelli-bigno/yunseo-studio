# 10. 상시 운영 — Windows 상주 서비스·일일 백업·일정 실행·상태 화면 (L6)

대시보드와 워커를 `windows-desktop`(Tailnet `100.84.73.107`)에서 **재부팅해도 스스로 뜨는 상주 서비스**로 돌리고, SQLite 를 매일 백업하고, 상태·로그를 대시보드 `/status` 에서 본다.
판단 방식: 기존 가정 → 근본 사실 → 결론. 실측하지 않은 것은 `[미검증]`.

> **설치는 PR 병합 뒤 Lead 지시로 한다.** 이 문서의 절차는 `--dry-run` 과 임시 체크아웃으로만 Windows 에서 실측했다(§7).

## 1. 실행 방식 — Windows 네이티브 Node + 작업 스케줄러

| 기존 가정 | 「WSL(Ubuntu) 안에서 systemd 서비스로 돌리면 리눅스식으로 깔끔하다」 |
| --- | --- |
| 근본 사실 | ①이 PC 의 WSL 은 **정지 이력**이 여러 번 있다: order-7 메모리 단편화 정지(10/18), 배포판 재생성 뒤 가드 누락으로 재발(10/23), `E_UNEXPECTED` 인스턴스 누수 80개(11/3), PSI 자기 상한 정체(11/1). WSL 이 서면 그 안의 서비스도 같이 선다. ②WSL 배포판은 세션이 없으면 **유휴 종료**되고, 부팅 때 `/etc/fstab` 을 D: 자동 마운트보다 먼저 처리해 `/mnt/d` 원천 바인드가 실패한다(10/31). 「재부팅 뒤 자동 시작」을 WSL 쪽에서 보장하려면 Windows 쪽 붙잡기 작업이 따로 필요하다. ③빌드·테스트용 `win auto` 실행기는 WSL 스냅샷이다 — 상주 서비스가 같은 WSL 메모리를 쓰면 무거운 빌드가 서비스를 누르고, 반대도 마찬가지다. ④Windows 에는 **Node v24.22.1(`C:\Program Files\nodejs\node.exe`)·pnpm 11.1.2·git** 이 이미 있다(2026-11-05 실측). 이 저장소는 네이티브 모듈이 없다(`node:sqlite` 내장, esbuild 설치 스크립트 끔). ⑤같은 PC 의 `stt-server` 가 이미 **네이티브 + 작업 스케줄러** 로 상주 중이고(10/31~) WSL 정지와 무관하게 살아 있다. |
| 결론 | **Windows 네이티브 Node 로 직접 실행**하고, 작업 스케줄러가 서비스마다 **감시 프로세스**(`ops/windows/supervise.ts`) 하나를 띄운다. WSL 은 빌드·테스트(`win auto`) 전용으로 남긴다. |

### 1.1 작업 스케줄러 정의 (`ops/windows/lib/task-xml.ts`)

| 항목 | 값 | 이유 |
| --- | --- | --- |
| 작업 | `\YunseoStudio\Dashboard`, `\YunseoStudio\Worker` | 서비스별로 따로 멈추고 켠다 |
| 트리거 | **부팅**(30초 지연) + **2분 반복** | 부팅 = 재부팅 자동 시작. 반복 = 감시 프로세스가 죽어도 2분 안에 다시 뜸 |
| 로그온 유형 | **S4U**(「사용자가 로그온하지 않아도 실행」, 암호 저장 안 함) | 재부팅 뒤 아무도 로그온하지 않아도 뜬다. stt-server 의 로그온 트리거 방식은 로그온해야 뜬다. S4U 는 네트워크 공유 인증이 없지만 이 서비스는 로컬 파일·TCP 만 쓴다 |
| 권한 | LeastPrivilege | 실행에 관리자 권한이 필요 없다(등록만 관리자) |
| 중복 | `IgnoreNew` | 감시 프로세스가 살아 있는 동안 반복 트리거는 무시된다 |
| 시간 제한·우선순위 | 없음(PT0S) · 5 | 기본값(72시간 제한·우선순위 7=낮음)은 상주 서비스에 맞지 않는다 |

### 1.2 감시 프로세스 (`ops/windows/supervise.ts`)

- 자식(대시보드 `next start` / 워커 `tsx src/main.ts`)을 띄우고 stdout·stderr 를 **회전 로그**(`data\logs\<서비스>.log`, 5MB × 5개)로 받는다.
- 자식이 죽으면 1·2·4…60초 간격으로 다시 띄운다(5분 넘게 버텼으면 간격 초기화).
- **부팅 직후 Tailscale IP 가 아직 없으면** 5초마다 확인하고 기다린다(없는 주소에 바인드하면 `EADDRNOTAVAIL` 로 바로 죽는다).
- 잠금 파일(`run\<서비스>.lock`, 배타 생성)로 서비스당 감시 프로세스 하나. 주인이 죽은 잠금은 넘겨받는다.
- **중지 표식**(`run\<서비스>.stop`)이 생기면 자식을 프로세스 트리째(`taskkill /T`) 끄고 나간다. 표식이 있는 동안 반복 트리거로 떠도 바로 나간다 — 운영자가 멈춘 서비스를 스케줄러가 되살리지 않는다.
- 배포된 커밋(`git rev-parse`)을 `YUNSEO_REVISION` 으로 자식에게 넘긴다 → `/status` 의 「배포 커밋」.

## 2. 배치

| 무엇 | 값 |
| --- | --- |
| 루트 | `D:\Services\yunseo-studio` (D: = 데이터 드라이브, `D:\Services\stt` 와 같은 자리) |
| 체크아웃 | `…\app` (deploy 대상, git) · bare 저장소 `…\repo.git` |
| 데이터 | `…\data\studio.db`(STUDIO_DB) · `…\data\backups\` · `…\data\logs\` |
| 실행 표식 | `…\run\` (잠금·중지 표식·작업 XML) |
| 대시보드 | `http://100.84.73.107:8930` — `next start -H 100.84.73.107 -p 8930` |
| 워커 | `http://100.84.73.107:8931/health` — `HOST=100.84.73.107 PORT=8931` |

- 포트 8930·8931 은 2026-11-05 실측 때 비어 있었다(같은 IP 에서 듣는 포트는 8922·8925뿐). 기존 미리보기 서버 **8925 는 건드리지 않는다**(통합 뒤 Lead 정리).
- 환경변수는 서비스 정의(`ops/windows/lib/layout.ts`)가 넣는다: `STUDIO_DB`·`YUNSEO_DATA_DIR`·`YUNSEO_WORKER_URL`·`YUNSEO_DASHBOARD_URL`·`YUNSEO_BACKUP_KEEP=14`·`NODE_ENV=production`. 비밀값은 없다.
- `STUDIO_CLOCK` 은 넣지 않았다 — 지금 데이터는 시안 기준일 둘레다. 실제 운영 데이터로 바뀌면 `STUDIO_CLOCK=system` 을 서비스 정의에 더한다(Lead 결정).

## 3. 보안 경계 — 왜 대시보드 로그인이 없나

| 기존 가정 | 「운영 화면이니 로그인(계정·비밀번호)이 있어야 한다」 |
| --- | --- |
| 근본 사실 | ①두 서비스는 **Tailscale 주소(100.84.73.107)에만 바인드**한다. 0.0.0.0·LAN·공인 주소로는 듣지 않는다 — 워커는 루프백·`100.64.0.0/10` 밖 주소를 설정에서 거부하고(`apps/worker/src/config.ts` `assertSafeHost`, 테스트 있음), 대시보드는 `-H 100.84.73.107` 로만 뜬다. ②Tailnet 에 들어오려면 사용자 계정으로 인증된 기기여야 한다(WireGuard 키). ③방화벽 규칙(`YunseoStudio Tailnet 8930-8931`)은 원격 주소 `100.64.0.0/10`, 로컬 주소 Tailnet IP 만 허용한다. ④로그인을 만들면 비밀번호·세션 비밀값을 보관·회전해야 하는데, 이 레인 범위는 「비밀값 없음」이다. ⑤상태 화면은 읽기 전용이고, 로그는 정해진 파일 이름(`worker`·`dashboard`)만 읽는다(경로를 요청에서 받지 않음). |
| 결론 | **인증 경계 = Tailnet**. 대시보드에 로그인을 두지 않는다. 조건: Tailnet 에 다른 사람 기기를 공유(share)하거나 Funnel·Serve 로 공개하면 이 근거가 깨진다 — 그때는 로그인을 먼저 넣는다. [미검증] 현재 Tailnet 공유 대상 없음은 Tailscale 관리 화면에서 확인하지 않았다. |

## 4. 일정 실행·백업

### 4.1 스케줄러 (`apps/worker/src/scheduler.ts`)

- 워커 안에서 돈다(작업 스케줄러를 작업마다 쓰지 않는다) — 실행 기록이 한 DB 표(`l6_job_runs`)에 모이고 `/health` 가 마지막·다음 실행을 바로 보인다.
- 일정은 고정 오프셋 KST(+09:00)로 계산한다. 한국은 일광 절약 시간이 없다.
- 타이머는 최대 60초씩만 기다리고 벽시계를 다시 본다 — PC 가 잠들었다 깨거나 시계가 바뀌어도 지난 작업을 다음 확인 때 돈다.
- 같은 작업은 겹쳐 돌지 않는다. 작업마다 시간 제한(기본 30분)이 있고 넘기면 실패로 기록한다. 워커가 죽어 「실행 중」으로 남은 기록은 다음 기동 때 실패로 닫는다.
- **작업 추가(다른 레인)**: `apps/worker/src/jobs/<이름>.ts` 에 `JobDefinition`(이름·일정·`run(ctx)`)을 만들고 `jobs/index.ts` 의 `registerJobs()` 에 한 줄을 더한다. `run` 이 돌려준 문자열이 기록 한 줄 요약, throw 는 실패다.

| 작업 | 일정 | 내용 |
| --- | --- | --- |
| `backup` | 매일 03:30 KST, **놓치면 기동 1분 뒤 따라잡기** | `VACUUM INTO` 로 `backups\studio-YYYYMMDD-HHMMSS.db`(KST) 생성 → `integrity_check` 통과 뒤에만 최종 이름 → 최신 14개만 남김 |
| `collect-events-0610` · `collect-events-1810` | 매일 06:10 · 18:10 KST (`STUDIO_DB` 있을 때만, 따라잡기 없음) | [L7] 공식 일정 수집(L4 `collectEventsOnce`) — 원천 하나라도 실패하면 실패 기록(성공한 원천 반영은 남음) |
| `health` | 10분마다 | 대시보드 `/api/health` 확인(200 아니면 실패 기록) + 실행 기록 작업별 최근 300개만 남김 |

### 4.2 백업 방식 (`packages/adapters/ops/src/sqlite-backup.ts`)

| 기존 가정 | 「DB 파일을 복사하면 된다」 |
| --- | --- |
| 근본 사실 | 대시보드가 DB 를 **WAL 모드로 연 채** 쓴다(storage 어댑터). 열린 DB 의 `.db` 파일만 복사하면 `-wal` 에 있는 최근 쓰기가 빠지거나 쓰는 도중의 페이지가 섞인다. `VACUUM INTO` 는 읽기 트랜잭션 하나로 **일관된 스냅샷**을 새 파일에 쓴다(WAL 내용 포함, 빈 공간 정리). `node:sqlite` 내장이라 추가 의존이 없다. |
| 결론 | `VACUUM INTO '<…>.partial'` → `PRAGMA integrity_check` → 이름 바꾸기. 반쯤 쓰인 파일은 목록에 섞이지 않고, 손상된 사본은 남지 않는다. 보존은 이름(KST 시각) 최신순 14개, 형식이 다른 파일(수동 사본)은 건드리지 않는다. |

### 4.3 복원 절차

1. 목록 보기: `node --import tsx ops/windows/opsctl.ts list-backups` (또는 `/status` 의 백업 표).
2. 계획 보기: `node --import tsx ops/windows/opsctl.ts restore studio-YYYYMMDD-HHMMSS.db --dry-run`.
3. 실행: 같은 명령에서 `--dry-run` 을 뺀다. 순서는 자동이다 — **두 서비스 중지(중지 표식 → 감시 프로세스 종료 대기) → 백업 무결성 검사 → 지금 DB(와 `-wal`·`-shm`)를 `studio.db.pre-restore-<시각>` 으로 옮김 → 백업을 복사·재검사 후 `studio.db` 로 → 서비스 시작 → 헬스 대기**.
4. 워커가 아직 응답하면 복원 명령(`ops-cli restore --yes`)이 거부한다(DB 를 쥔 프로세스가 있을 때 파일을 바꾸지 않는다).
5. 되돌리기: `pre-restore-<시각>` 파일을 같은 방법으로 다시 넣는다(지우지 않으므로 남아 있다).

복원 검증 테스트: `packages/adapters/ops/src/ops.test.ts`(백업 시점 내용으로 돌아옴·이전 DB 보존·손상 백업 거부), `apps/worker/src/ops-cli.test.ts`(백업 → 변경 → 복원 → 내용 일치, 워커 살아 있으면 거부).

## 5. 상태·로그

- 워커 `GET /health` → `{ status, app, startedAt, revision, jobs: [{ name, schedule, lastRun, nextRun, running }] }`.
- 대시보드 `/status`(메뉴 「운영」): 서비스 2개 헬스(주소·응답 시간·배포 커밋), 예약 작업(마지막·다음 실행), 최근 작업 기록 20건, 백업 목록·총용량, `worker.log`·`dashboard.log` 마지막 30줄. 마지막 백업이 26시간을 넘기면 경고색.
- 로그 회전: 감시 프로세스가 5MB 직전에 `.log → .log.1 → … → .log.5` 로 민다(서비스당 최대 약 30MB).

## 6. 명령

Mac(배포 조정) — Git 으로만 옮긴다. Windows git 에는 GitHub 인증이 없어서(2026-11-05 실측: `git ls-remote` askpass 실패) Mac 이 Windows 의 bare 저장소로 push 하고 Windows 체크아웃이 그 저장소에서 받는다.

```
git fetch origin
ops/windows/deploy.sh --first-time --dry-run   # 첫 설치 계획(원격에 아무것도 안 함)
ops/windows/deploy.sh --first-time             # bare 저장소·체크아웃 생성 → 설치 → 시작   (Lead 지시 뒤)
ops/windows/deploy.sh                          # 갱신: origin/main 을 push → 중지 → pnpm install → 빌드 → 시작 → 상태
ops/windows/deploy.sh --ref <커밋>              # 특정 커밋(되돌리기 포함)
```

Windows(`ssh windows-desktop`, 셸은 Git Bash) — `cd /d/Services/yunseo-studio/app` 에서:

```
node --import tsx ops/windows/opsctl.ts preflight          # 읽기만: Node·관리자·Tailnet IP·포트·체크아웃·빌드·작업 등록 여부
node --import tsx ops/windows/opsctl.ts install --dry-run  # 등록 단계 출력. 실제 install/uninstall 은 관리자 셸
node --import tsx ops/windows/opsctl.ts status
node --import tsx ops/windows/opsctl.ts stop|start|restart [dashboard|worker]
node --import tsx ops/windows/opsctl.ts backup-now
node --import tsx ops/windows/opsctl.ts uninstall           # 작업·방화벽 규칙 제거, 데이터는 남김
```

갱신 때 서비스를 먼저 멈추는 이유: 실행 중인 `next` 가 `.next`·`node_modules` 파일을 쥐고 있으면 Windows 에서 덮어쓰기가 실패한다. 멈춤 구간은 설치·빌드 시간만큼이다(§7 실측).

## 7. Windows 실측 (설치 전, 2026-11-05)

설치 없이 임시 체크아웃(`git bundle` → `git clone`, 작업트리 복사 아님)에서 돌렸다.

임시 루트 `C:\Users\yjh99\AppData\Local\Temp\yunseo-l6-dryrun`(`--root` 로 지정)이라 작업 스케줄러·방화벽은 건드리지 않았다. 감시 프로세스는 손으로 띄워 실제 포트(Tailnet 8930·8931)에서 몇 초 돌린 뒤 `opsctl stop` 으로 내렸다.

| 항목 | 결과 |
| --- | --- |
| `opsctl preflight` | 전부 ok(빌드·DB 없음 경고만) — Node v24.22.1, 계정 `bigno\yjh99`, **관리자 셸**(`net session` 성공 → S4U 등록 가능), Tailnet IP 있음, 8930·8931 비어 있음, 작업 미등록 |
| `install`·`uninstall`·`restart worker`·`restore <파일>` `--dry-run` | 종료 0, 단계 16·7·5·11개 출력(위 §6 순서 그대로) |
| 의존 설치 `pnpm install --frozen-lockfile`(네이티브) | 13초 |
| 대시보드 빌드(네이티브 `next build`) | 22초 → 갱신 때 멈춤 구간 ≈ 중지 4초 + 설치 + 빌드 + 기동 ≈ 40초~1분 |
| 감시 프로세스 → 헬스 200 | 워커·대시보드 둘 다 첫 확인(1초 안)에 200. 워커 기동 로그 → 대기까지 0.2초, `next start` Ready 104ms |
| 바인드 | `netstat`: `100.84.73.107:8930`·`:8931` 만 LISTENING. `127.0.0.1:8931` 은 연결 안 됨(000) |
| `/status` 화면 | HTTP 200, 94ms, 「서비스 정상·예약 작업·worker.log」 그려짐 |
| 워커 `/health` | `jobs` 에 `backup`(매일 03:30 KST, 첫 기동이라 따라잡기 1분 뒤 예정)·`health`(10분마다) |
| `opsctl backup-now` | `studio-20261105-085716.db`(64KB) 생성, `list-backups` count=1 |
| `opsctl stop` | 4초에 두 서비스 종료, 포트 해제, 중지 표식이 있는 동안 감시 프로세스를 다시 띄우면 바로 종료(0) |
| 자식 강제 종료(`taskkill /F`) | 감시 프로세스가 1초 대기 뒤 재시작, 2초 안에 새 pid 가 다시 LISTENING |
| 감시 프로세스 중복 실행 | 잠금 때문에 두 번째는 바로 종료(0) |
| 작업 XML | UTF-16LE 파일을 PowerShell `[xml]` 로 파싱 성공(S4U·부팅 지연 PT30S·node 경로) |

## 8. 남은 것·미검증

- [미검증] S4U 작업 등록이 이 PC 의 OpenSSH 관리자 세션에서 되는지 — `preflight` 의 admin 항목이 ok 이면 된다. 안 되면 「암호 저장」 방식 대신 로그온 트리거(stt-server 방식)로 바꾸는 선택지가 있고, 그때는 재부팅 뒤 로그온해야 뜬다.
- [미검증] 실제 재부팅 뒤 자동 시작 — 설치 뒤 Lead 지시로 재부팅 1회 확인.
- 8925 미리보기 서버 정리, `STUDIO_CLOCK=system` 전환은 Lead 몫.
- [L7] 대시보드 릴스 합성은 서비스 계정의 PATH 에 ffmpeg 가 있어야 한다(없으면 릴스 단계만 비활성). Windows 네이티브 서비스로 띄울 때 `FFMPEG_PATH`·`FFPROBE_PATH` 를 서비스 정의에 넣을지는 설치 단계(Lead)에서 정한다 — 지금 실측은 WSL 실행기(/usr/bin/ffmpeg 6.1.1)뿐이다. [미검증] 네이티브 Windows `next start` 에서 `@resvg/resvg-js` 외부 모듈 로드.
