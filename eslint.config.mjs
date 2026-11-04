// 의존 경계(docs/04-architecture.md 「의존 규칙」)를 import 문 단위로 강제한다.
// 선언 의존(package.json)은 tests/boundaries.test.ts 가 따로 검사한다.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

const restrict = (regex, message) => ({
  "no-restricted-imports": ["error", { patterns: [{ regex, message }] }],
});

export default tseslint.config(
  { ignores: ["**/node_modules/**", "**/dist/**", "pnpm-lock.yaml"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // 규칙 1: domain 은 어떤 패키지도 import 하지 않는다(상대 경로만).
    files: ["packages/domain/src/**/*.ts"],
    rules: restrict("^(?!\\.{1,2}/).*", "domain 은 외부·다른 패키지를 import 할 수 없다 (04 규칙 1)"),
  },
  {
    // 규칙 2: application 은 domain 만 import 한다.
    files: ["packages/application/src/**/*.ts"],
    rules: restrict("^(?!\\.{1,2}/|@yunseo/domain$).*", "application 은 domain 만 import 할 수 있다 (04 규칙 2)"),
  },
  {
    // 규칙 3: 어댑터(presets-schema 포함)끼리, 그리고 apps 를 import 하지 않는다.
    files: ["packages/adapters/*/src/**/*.ts", "packages/presets-schema/src/**/*.ts"],
    rules: restrict(
      "^@yunseo/(adapters-|presets-schema$|app-)",
      "어댑터는 다른 어댑터·apps 를 import 할 수 없다 (04 규칙 3)",
    ),
  },
  {
    // apps 끼리 import 금지 (03 경계 규칙).
    files: ["apps/*/src/**/*.ts"],
    rules: restrict("^@yunseo/app-", "apps 끼리 import 할 수 없다 (03 경계 규칙)"),
  },
);
