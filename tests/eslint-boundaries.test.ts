// eslint.config.mjs 의 경계 규칙이 실제로 위반을 잡는지(그리고 올바른 import 는 통과시키는지) 가상 코드로 확인한다.
// 규칙을 고치다 구멍이 나도 여기서 드러난다.
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url));
const eslint = new ESLint({ cwd: root });

async function messages(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: `${root}${filePath}` });
  return (result?.messages ?? []).filter((m) => m.ruleId === "no-restricted-imports").map((m) => m.message);
}

const cases: { name: string; file: string; code: string; error: RegExp | null }[] = [
  { name: "domain → application", file: "packages/domain/src/story/x.ts", code: 'import { a } from "@yunseo/application";\nexport const b = a;\n', error: /domain/ },
  { name: "domain → 상대 경로는 허용", file: "packages/domain/src/story/x.ts", code: 'import { a } from "./y";\nexport const b = a;\n', error: null },
  { name: "application → adapters", file: "packages/application/src/x.ts", code: 'import { a } from "@yunseo/adapters-storage";\nexport const b = a;\n', error: /application/ },
  { name: "application → node:fs", file: "packages/application/src/x.ts", code: 'import { readFileSync } from "node:fs";\nexport const b = readFileSync;\n', error: /application/ },
  { name: "application → domain 은 허용", file: "packages/application/src/x.ts", code: 'import { a } from "@yunseo/domain";\nexport const b = a;\n', error: null },
  { name: "어댑터 → 다른 어댑터", file: "packages/adapters/storage/src/x.ts", code: 'import { a } from "@yunseo/adapters-render-html";\nexport const b = a;\n', error: /어댑터/ },
  { name: "어댑터 → react", file: "packages/adapters/storage/src/x.ts", code: 'import { useState } from "react";\nexport const b = useState;\n', error: /화면 계층/ },
  { name: "어댑터 → application·node 는 허용", file: "packages/adapters/storage/src/x.ts", code: 'import { a } from "@yunseo/application";\nimport { b } from "node:path";\nexport const c = [a, b];\n', error: null },
  { name: "ui → application", file: "packages/ui/src/x.tsx", code: 'import { a } from "@yunseo/application";\nexport const b = a;\n', error: /ui/ },
  { name: "화면 → 어댑터", file: "apps/dashboard/src/app/x/page.tsx", code: 'import { a } from "@yunseo/adapters-storage";\nexport default function P() { return a; }\n', error: /조립부/ },
  { name: "화면 → node:fs", file: "apps/dashboard/src/lib/x.ts", code: 'import { readFileSync } from "node:fs";\nexport const b = readFileSync;\n', error: /Node 내장/ },
  { name: "조립부(server/) → 어댑터는 허용", file: "apps/dashboard/src/server/x.ts", code: 'import { a } from "@yunseo/adapters-storage";\nimport { b } from "node:path";\nexport const c = [a, b];\n', error: null },
  { name: "클라이언트 섬 → 유스케이스", file: "apps/dashboard/src/components/X.tsx", code: 'import { a } from "@yunseo/application";\nexport function X() { return a; }\n', error: /클라이언트 섬/ },
  { name: "클라이언트 섬 → 서버 조립부", file: "apps/dashboard/src/components/X.tsx", code: 'import { studio } from "@/server/studio";\nexport function X() { return studio; }\n', error: /서버 조립부/ },
  { name: "클라이언트 섬 → ui·domain 은 허용", file: "apps/dashboard/src/components/X.tsx", code: 'import { Card } from "@yunseo/ui";\nimport { claimIssues } from "@yunseo/domain";\nexport function X() { return [Card, claimIssues]; }\n', error: null },
  { name: "apps 끼리", file: "apps/dashboard/src/lib/x.ts", code: 'import { a } from "@yunseo/app-worker";\nexport const b = a;\n', error: /apps 끼리/ },
];

describe("ESLint 경계 규칙이 위반을 잡는다", () => {
  it.each(cases)("$name", async ({ file, code, error }) => {
    const found = await messages(file, code);
    if (error) expect(found.some((m) => error.test(m)), found.join(" | ") || "(경고 없음)").toBe(true);
    else expect(found).toEqual([]);
  });
});
