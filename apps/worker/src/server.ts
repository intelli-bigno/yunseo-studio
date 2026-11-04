// 헬스 체크 서버. 잡 큐 소비(docs/05-automation.md)는 M3 이후 — 지금은 살아 있음만 알린다.
import { createServer, type Server } from "node:http";

export function createWorkerServer(): Server {
  return createServer((req, res) => {
    const path = (req.url ?? "").split("?")[0];
    if (req.method === "GET" && path === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok", app: "worker" }));
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "not_found" }));
  });
}
