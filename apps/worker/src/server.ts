// 헬스 서버 — GET /health 하나. 상태 화면(대시보드 /status)이 이 응답으로 작업의 마지막 실행·다음 실행을 그린다.
import { createServer, type Server, type ServerResponse } from "node:http";
import type { OpsJobState } from "@yunseo/application";
import { describeFailure, toAppError } from "@yunseo/domain";

export interface WorkerHealth {
  status: "ok";
  app: "worker";
  startedAt?: string;
  revision?: string | null;
  jobs?: OpsJobState[];
}

const basic = (): WorkerHealth => ({ status: "ok", app: "worker" });

const send = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
};

/** 오류 응답은 대시보드 API 와 같은 모양 { error: { code, message } } */
const sendError = (res: ServerResponse, code: string, message: string, status: number) => send(res, status, { error: { code, message } });

export function createWorkerServer(health: () => WorkerHealth = basic, log: (message: string) => void = (m) => console.error(m)): Server {
  return createServer((req, res) => {
    const path = (req.url ?? "").split("?")[0];
    if (req.method === "GET" && path === "/health") {
      try {
        send(res, 200, health());
      } catch (e) {
        // 상태를 모으다 던져도 프로세스가 죽지 않는다 — 500 으로 답하고 이유는 로그에 남긴다
        const err = toAppError(e);
        log(`/health 실패: ${describeFailure(e)}`);
        if (!res.headersSent) sendError(res, err.code, "상태를 만들지 못했다", 500);
        else res.end();
      }
      return;
    }
    sendError(res, "NOT_FOUND", `${req.method ?? "GET"} ${path} 는 없다`, 404);
  });
}
