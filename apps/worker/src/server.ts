// 헬스 서버 — GET /health 하나. 상태 화면(대시보드 /status)이 이 응답으로 작업의 마지막 실행·다음 실행을 그린다.
import { createServer, type Server } from "node:http";
import type { OpsJobState } from "@yunseo/application";

export interface WorkerHealth {
  status: "ok";
  app: "worker";
  startedAt?: string;
  revision?: string | null;
  jobs?: OpsJobState[];
}

const basic = (): WorkerHealth => ({ status: "ok", app: "worker" });

export function createWorkerServer(health: () => WorkerHealth = basic): Server {
  return createServer((req, res) => {
    const path = (req.url ?? "").split("?")[0];
    if (req.method === "GET" && path === "/health") {
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify(health()));
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "not_found" }));
  });
}
