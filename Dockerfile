# yunseo-studio 상주 이미지 — 대시보드(Next.js)와 워커(tsx)를 한 컨테이너에서 띄운다(ops/docker/entrypoint.sh).
# 빌드·실행은 Windows(WSL Docker)에서만: ops/docker/README.md. Mac 에서 docker 실행 금지.
# 빌드 입력은 `git archive` 로 뽑은 깨끗한 커밋 트리다(node_modules·.next 없음, .dockerignore 가 한 번 더 막는다).

# Debian 12(bookworm) 기반 node 22. 이 PC 에 이미 받아 둔 태그라 레지스트리 자격증명 없이 빌드된다(ops/docker/README.md 「함정」).
FROM node:22-slim

ENV NEXT_TELEMETRY_DISABLED=1 CI=1 TZ=Asia/Seoul

# ffmpeg·fonts-dejavu-core = 릴스 합성(L3/L7)에 필요 — .github/workflows/ci.yml 과 같은 구성이다.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates ffmpeg fonts-dejavu-core \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g pnpm@11.13.1 \
 && install -d -o node -g node /app /data

USER node
WORKDIR /app
COPY --chown=node:node . .

RUN --mount=type=cache,target=/home/node/.local/share/pnpm/store,uid=1000,gid=1000 \
    pnpm install --frozen-lockfile
RUN pnpm --filter @yunseo/app-dashboard run build

# 배포된 커밋 — /status 의 「배포 커밋」. 빌드 캐시를 깨지 않도록 빌드 뒤에 둔다.
ARG YUNSEO_REVISION=unknown
ENV YUNSEO_REVISION=${YUNSEO_REVISION}

# 대시보드(8930)와 워커(8931, 컨테이너 안 루프백 전용)를 같이 띄운다 — ops/docker/entrypoint.sh
EXPOSE 8930
CMD ["bash", "/app/ops/docker/entrypoint.sh"]
