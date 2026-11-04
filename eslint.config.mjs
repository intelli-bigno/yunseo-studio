// 의존 경계(docs/04-architecture.md 「의존 규칙」)를 import 문 단위로 강제한다.
// 선언 의존(package.json)은 tests/boundaries.test.ts, import 그래프 전체는 tests/import-graph.test.ts,
// 이 규칙이 실제로 위반을 잡는지는 tests/eslint-boundaries.test.ts 가 따로 검사한다 — 세 겹으로 경계를 지킨다.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

/** no-restricted-imports — 같은 파일에 규칙 객체가 겹치면 뒤의 것이 앞의 것을 덮으므로, 겹치는 곳은 패턴을 한 번에 다 적는다. */
const restrict = (...patterns) => ({
  "no-restricted-imports": ["error", { patterns: patterns.map(([regex, message]) => ({ regex, message })) }],
});

const APPS = ["^@yunseo/app-", "apps 끼리 import 할 수 없다 (03 경계 규칙)"];
const ADAPTERS = ["^@yunseo/adapters-", "어댑터는 조립부(apps/dashboard/src/server/)에서만 import 한다 (04 규칙 4)"];
const NODE = ["^node:", "Node 내장 모듈은 서버 조립부·어댑터에서만 쓴다 — 화면은 유스케이스만 호출한다 (06 §1.5)"];

export default tseslint.config(
  { ignores: ["**/node_modules/**", "**/dist/**", "**/.next/**", "**/next-env.d.ts", "pnpm-lock.yaml"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // 측정·운영 스크립트(Node 직접 실행)는 Node 전역을 쓴다.
    files: ["scripts/**/*.mjs"],
    languageOptions: { globals: { process: "readonly", fetch: "readonly", Buffer: "readonly", URL: "readonly", setTimeout: "readonly", console: "readonly" } },
  },
  {
    // 규칙 1: domain 은 어떤 패키지도 import 하지 않는다(상대 경로만).
    files: ["packages/domain/src/**/*.ts"],
    ignores: ["**/*.test.ts"],
    rules: restrict(["^(?!\\.{1,2}/).*", "domain 은 외부·다른 패키지를 import 할 수 없다 (04 규칙 1)"]),
  },
  {
    // 도메인 테스트는 테스트 러너(vitest)만 추가로 쓴다.
    files: ["packages/domain/src/**/*.test.ts"],
    rules: restrict(["^(?!\\.{1,2}/|vitest$).*", "domain 테스트는 vitest 와 상대 경로만 import 할 수 있다 (04 규칙 1)"]),
  },
  {
    // 디자인 토큰은 domain 과 같이 외부 의존 0 (상대 경로만).
    files: ["packages/design-tokens/src/**/*.ts"],
    ignores: ["**/*.test.ts"],
    rules: restrict(["^(?!\\.{1,2}/).*", "design-tokens 는 외부·다른 패키지를 import 할 수 없다"]),
  },
  {
    // 규칙 2: application 은 domain 만 import 한다(Node 내장·SDK·HTTP·파일 시스템 금지 — 포트 뒤로).
    files: ["packages/application/src/**/*.ts"],
    ignores: ["**/*.test.ts"],
    rules: restrict(["^(?!\\.{1,2}/|@yunseo/domain$).*", "application 은 domain 만 import 할 수 있다 (04 규칙 2)"]),
  },
  {
    files: ["packages/application/src/**/*.test.ts"],
    rules: restrict(["^(?!\\.{1,2}/|@yunseo/domain$|vitest$).*", "application 테스트는 domain·vitest·상대 경로만 import 할 수 있다 (04 규칙 2)"]),
  },
  {
    // 규칙 3: 어댑터(presets-schema 포함)끼리, apps·화면 계층과 서로 import 하지 않는다.
    files: ["packages/adapters/*/src/**/*.ts", "packages/presets-schema/src/**/*.ts"],
    rules: restrict(
      ["^@yunseo/(adapters-|presets-schema$|app-)", "어댑터는 다른 어댑터·apps 를 import 할 수 없다 (04 규칙 3)"],
      ["^(react|react-dom|next)(/|$)|^@yunseo/(ui|design-tokens)$", "어댑터는 화면 계층(react·next·ui)을 알 수 없다 (04 계층)"],
    ),
  },
  {
    // 대시보드 화면은 @yunseo/ui 컴포넌트만 쓴다 — 클래스·인라인 스타일·임의 px 금지(규격 통일).
    files: ["apps/dashboard/src/**/*.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        { selector: "JSXAttribute[name.name='style']", message: "인라인 스타일 금지 — @yunseo/ui 컴포넌트 props 를 쓴다" },
        { selector: "JSXAttribute[name.name='className']", message: "className 금지 — @yunseo/ui 컴포넌트 props(variant·size·tone)를 쓴다" },
        { selector: "Literal[value=/\\d+px/]", message: "임의 px 금지 — 디자인 토큰을 쓴다" },
      ],
    },
  },
  {
    // ui 패키지는 디자인 토큰과 react 만 import 한다.
    files: ["packages/ui/src/**/*.{ts,tsx}"],
    ignores: ["**/*.test.ts"],
    rules: restrict(["^(?!\\.{1,2}/|react$|react/|@yunseo/design-tokens$).*", "ui 는 react 와 design-tokens 만 import 할 수 있다"]),
  },
  {
    files: ["packages/ui/src/**/*.test.ts"],
    rules: restrict(["^(?!\\.{1,2}/|vitest$).*", "ui 테스트는 vitest 와 상대 경로만 import 할 수 있다"]),
  },
  {
    // apps 끼리 import 금지 (03 경계 규칙).
    files: ["apps/*/src/**/*.{ts,tsx}"],
    rules: restrict(APPS),
  },
  {
    // 대시보드: 어댑터·Node 내장은 조립부(src/server/)에만. 나머지(화면·lib)는 유스케이스 결과만 안다.
    files: ["apps/dashboard/src/**/*.{ts,tsx}"],
    ignores: ["apps/dashboard/src/server/**", "**/*.test.ts"],
    rules: restrict(APPS, ADAPTERS, NODE),
  },
  {
    // 클라이언트 섬(components/): 서버 조립부·유스케이스 런타임도 가져올 수 없다 — 브라우저 번들에 서버 코드가 새지 않게.
    files: ["apps/dashboard/src/components/**/*.{ts,tsx}"],
    rules: restrict(APPS, ADAPTERS, NODE, ["^@yunseo/application", "클라이언트 섬은 유스케이스를 직접 부르지 않는다 — 서버 컴포넌트가 결과를 props 로 준다"], ["(^@/server/|(^|/)server/)", "클라이언트 섬은 서버 조립부를 import 할 수 없다"]),
  },
);
