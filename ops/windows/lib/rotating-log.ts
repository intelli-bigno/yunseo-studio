// 크기 회전 로그 — 파일이 maxBytes 를 넘기기 직전에 name.log → name.log.1 → … → name.log.<keep> 로 밀고 가장 오래된 것은 버린다.
// 감시 프로세스가 자식(대시보드·워커)의 stdout·stderr 를 이 파일로 받는다. 외부 의존 없음.
import { closeSync, existsSync, mkdirSync, openSync, renameSync, statSync, unlinkSync, writeSync } from "node:fs";
import { dirname } from "node:path";

export class RotatingLog {
  readonly path: string;
  readonly maxBytes: number;
  readonly keep: number;
  #fd: number;
  #size: number;

  constructor(path: string, { maxBytes = 5 * 1024 * 1024, keep = 5 }: { maxBytes?: number; keep?: number } = {}) {
    if (maxBytes < 1024 || keep < 1) throw new Error("maxBytes ≥ 1024, keep ≥ 1");
    this.path = path;
    this.maxBytes = maxBytes;
    this.keep = keep;
    mkdirSync(dirname(path), { recursive: true });
    this.#fd = openSync(path, "a");
    this.#size = statSync(path).size;
  }

  write(chunk: string | Uint8Array): void {
    const buf = typeof chunk === "string" ? Buffer.from(chunk, "utf8") : Buffer.from(chunk);
    if (this.#size > 0 && this.#size + buf.length > this.maxBytes) this.rotate();
    writeSync(this.#fd, buf);
    this.#size += buf.length;
  }

  line(text: string): void {
    this.write(`${new Date().toISOString()} ${text}\n`);
  }

  rotate(): void {
    closeSync(this.#fd);
    const oldest = `${this.path}.${this.keep}`;
    if (existsSync(oldest)) unlinkSync(oldest);
    for (let i = this.keep - 1; i >= 1; i--) {
      const from = `${this.path}.${i}`;
      if (existsSync(from)) renameSync(from, `${this.path}.${i + 1}`);
    }
    renameSync(this.path, `${this.path}.1`);
    this.#fd = openSync(this.path, "a");
    this.#size = 0;
  }

  close(): void {
    closeSync(this.#fd);
  }
}
