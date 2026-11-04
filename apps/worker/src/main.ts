import { createWorkerServer } from "./server";

const port = Number(process.env["PORT"] ?? 4010);
const server = createWorkerServer();

server.listen(port, () => {
  console.log(`worker 대기 중 — http://localhost:${port}/health`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
