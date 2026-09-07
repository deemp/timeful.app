---
id: TASK-0164
title: Move the browser E2E suite to a self-contained root e2e package
status: Done
assignee:
  - opencode
created_date: '2026-09-06 15:48'
updated_date: '2026-09-07 10:48'
labels:
  - e2e
  - tooling
dependencies: []
references:
  - frontend/config/tooling.ts
  - frontend/playwright.config.ts
  - frontend/e2e/isolated-test-stack.ts
  - flake.nix
  - .github/workflows/backend-ci.yml
documentation:
  - docs/environments.md
  - frontend/e2e/AGENTS.md
  - frontend/e2e/inspect/AGENTS.md
  - frontend/AGENTS.md
  - AGENTS.md
priority: medium
type: chore
ordinal: 175300
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The browser E2E suite is not a frontend-only concern: its global setup boots the full isolated stack (mongo-test, postgres-test, server-test via root compose.yaml + compose.test.yaml) and the specs exercise the integrated system. It should live at the repository root as a self-contained package instead of inside frontend/.

Outcome: a new root-level e2e/ package owns all browser E2E tooling (Playwright config, specs, helpers, inspect diagnostics, repro entrypoints, stack orchestration), and frontend/ no longer carries any E2E wiring. The root package.json stays a markdown-tooling-only package; the e2e suite gets its own package.json, lockfile, tsconfig, ESLint config, and oxfmt config.

Confirmed decisions and constraints:
- Full relocation: inspect/ and repro/ move with the specs (user chose full move over a specs-only split).
- The e2e package must not import frontend source modules; it consumes the documented repo-root env contract (.env.test / .env.development). The landing sign-in flag read used by landing-hero.spec.ts must resolve from that env contract at the boundary.
- The Playwright webServer must keep starting the frontend Vite dev server from frontend/ (currently npm run dev:test), and isolated-test-stack.ts keeps orchestrating the root Compose test stack; only the file locations and package wiring change.
- frontend/config/tooling.ts is split: e2e-only exports move into the e2e package; frontend dev-server/preview helpers stay for vite.config.ts.
- flake.nix renames its frontend-e2e runner to e2e and .github/workflows/backend-ci.yml is updated to match.
- Documentation and agent guides move with the code and are corrected for new paths; the E2E_* environment variable contract in docs/environments.md keeps its current values.
- No behavior change to the app; this is infrastructure relocation, so existing specs must pass unchanged apart from path and package adjustments.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A self-contained e2e/ package exists at the repository root containing the Playwright config, all specs, helpers, isolated-test-stack.ts, inspect/, repro/, and their AGENTS.md guides; frontend/e2e no longer exists
- [x] #2 Running npm run test:e2e from e2e/ boots the isolated Compose test stack (mongo-test, postgres-test, server-test) plus the frontend Vite dev server, the full chromium-desktop project passes, and per-run artifact directories under /tmp/opencode/timeful-e2e-artifacts (with E2E_ARTIFACTS_DIR override) still work
- [x] #3 The firefox-desktop timed-event-postgres-plugin-firefox spec passes when run from the new e2e/ package
- [x] #4 The e2e package has its own package.json, lockfile, tsconfig, ESLint config preserving the locator-hygiene, settle-exception, and repro raw-page rules, and oxfmt config; it imports no frontend source modules; the Playwright webServer still starts the frontend dev server from frontend/
- [x] #5 frontend/config/tooling.ts retains only frontend dev-server, preview, and env helpers; e2e-only tooling (tooling mode, isolated E2E network, healthcheck URL, artifacts dir, Playwright config factory) lives in the e2e package; the e2e package loads the documented repo-root env contract through vite loadEnv (user decision 2026-09-07: keep the vite dependency rather than hand-roll a dotenv parser); vite.config.ts behavior is unchanged
- [x] #6 frontend/ cleanup removes the @playwright/test dependency, all test:e2e*/repro/inspect scripts, tsconfig.e2e.json and its typecheck segment, e2e lint/fmt globs, and e2e ESLint blocks; npm run lint, fmt:check, typecheck, build, and test:unit all pass in frontend/
- [x] #7 flake.nix provides .#e2e (renamed from .#frontend-e2e) running npm ci and the e2e suite from e2e/, and .github/workflows/backend-ci.yml references .#e2e; nix flake check passes
- [x] #8 The landing-hero spec determines landing sign-in expectations from the documented env contract without importing frontend source code
- [x] #9 Docs updated: root AGENTS.md E2E sections, frontend/AGENTS.md Browser Verification, e2e/AGENTS.md and e2e/inspect/AGENTS.md paths, and docs/environments.md commands; the E2E_* environment variable contract values are unchanged
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 All acceptance criteria are satisfied
- [x] #2 All required unit tests pass. Documentation-only changes are exempt unless the user requests unit tests
- [x] #3 All required e2e tests pass. Documentation-only changes are exempt unless the user requests e2e tests
- [x] #4 Changed Markdown files are formatted with npm run format:markdown
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan

### Layout decision
Flatten the old `frontend/e2e/` contents one level up into the new root package so spec-relative imports (`./helpers/...`, `../helpers/...`) stay valid:
`frontend/e2e/X.spec.ts -> e2e/X.spec.ts`, `helpers/`, `inspect/`, `repro/`, `AGENTS.md`, `isolated-test-stack.ts`; `frontend/playwright.config.ts -> e2e/playwright.config.ts`; new `e2e/config/tooling.ts` holds the e2e half of the old `frontend/config/tooling.ts`.

### 1. Create the root e2e package
- `git mv frontend/e2e e2e` (contents land at package root; relative imports keep working), `git mv frontend/playwright.config.ts e2e/playwright.config.ts`.
- New `e2e/config/tooling.ts` (no frontend src import): `getActiveToolingMode`, `loadRootEnv` via vite `loadEnv` (user decision: keep vite dep), `loadIsolatedE2ENetwork`, `getIsolatedE2EHealthcheckURL`, `resolveLandingSignInEnabled` implemented locally from the documented env contract (`VITE_ENABLE_SIGN_IN` + `VITE_ENABLE_RICH_LANDING`, unset/blank or non-`false` means enabled), `createPlaywrightArtifactsDir` (E2E_ARTIFACTS_DIR / os.tmpdir()/opencode/timeful-e2e-artifacts), `createPlaywrightConfig` (test branch: E2E network + `npm run dev:test`; dev branch: VITE_DEV_HOST/PORT + `npm run dev:test -- --host --port`).
- `e2e/playwright.config.ts`: same projects/use/options; `testDir: "."` (Playwright collector skips node_modules - verified playwright/lib/runner/index.js:2236), `globalSetup: "./isolated-test-stack.ts"`, `webServer: { command, cwd: "../frontend", port, reuseExistingServer: false, timeout: 120000 }` (webServer.cwd verified in playwright types test.d.ts:10375).
- `e2e/isolated-test-stack.ts`: repoRoot = parent of package dir; import `./config/tooling`; keep `loadEnv` from vite.
- `e2e/landing-hero.spec.ts`: import from `./config/tooling` (AC #8).
- New `e2e/package.json` (name timeful-e2e, private, node>=26.5.0): scripts test:e2e, test:e2e:update, test:e2e:repro*(4), inspect*(4), lint (`oxlint . && eslint . --cache --concurrency 1`), lint:fix, fmt/fmt:check (`oxfmt .`), typecheck (`tsc -p tsconfig.json`). Deps: temporal-polyfill; devDeps: @playwright/test, vite (^8, loadEnv), tsx, eslint stack (eslint, @eslint/js, typescript-eslint, eslint-config-prettier, eslint-plugin-oxlint, oxlint, oxlint-tsgolint, oxfmt), typescript-native-bridge alias, @types/node, jiti. Generate `e2e/package-lock.json` via npm install.
- New `e2e/tsconfig.json`: standalone strict (ES2022, module ESNext, moduleResolution bundler, allowImportingTsExtensions, noEmit, types node/@playwright/test/vite/client), include `config/**/*.ts`, root `*.ts`, `helpers/**`, `repro/**`, `inspect/**` (same coverage as old tsconfig.e2e.json).
- New `e2e/eslint.config.ts`: eslint recommended + tseslint parser + oxlint flat/recommended + prettier last; ignores `node_modules/**`, `dist/**`, `inspect/**` (mirrors old `--ignore-pattern 'e2e/inspect/**'`); temporal no-Date rules global; locator hygiene (waitForSelector/waitForTimeout/$/$$/pause) on `**/*.spec.ts`, `helpers/**`, `isolated-test-stack.ts`; settle.ts and `repro/**` keep temporal-only exception; update settle message path to `helpers/settle`.
- New `e2e/.oxlintrc.json` (frontend copy; ignorePatterns node_modules, dist, inspect) and `e2e/.oxfmtrc.json` (semi false, printWidth 80, ignorePatterns node_modules, dist, inspect).
- New `e2e/.gitignore` (node_modules/, __screenshots__/ for snapshotPathTemplate parity).
- `e2e/AGENTS.md` + `e2e/inspect/AGENTS.md`: retitle to the root package, commands now run from `e2e/`, `../AGENTS.md` required-checks link becomes `../frontend/AGENTS.md`.

### 2. frontend/ cleanup
- `frontend/config/tooling.ts`: remove `getActiveToolingMode`, `resolveLandingSignInEnabled`, `getIsolatedE2EHealthcheckURL`, `createFrontendPlaywrightArtifactsDir`, `createFrontendPlaywrightConfig`, `FrontendPlaywrightConfig`, and the frontend-src `featureAvailability` import; keep dev-server/preview/env helpers plus private loadIsolatedE2ENetwork/getIsolatedE2EApiBaseURL and loadRootEnv/normalizeRootEnvMode/readProcessEnv (vite loadEnv stays); vite.config.ts untouched.
- `frontend/package.json`: drop `@playwright/test` and `tsx` devDeps; drop scripts `test:e2e`, `test:e2e:update`, `test:e2e:repro*`, `inspect*`; typecheck loses `tsc -p tsconfig.e2e.json`; lint/fmt globs become `src` only. `npm install` to refresh package-lock.json.
- Delete `frontend/tsconfig.e2e.json`; `frontend/tsconfig.node.json` drops `src/utils/featureAvailability.ts` from include.
- `frontend/eslint.config.ts`: remove e2eLocatorHygieneRestrictions and the three e2e rule blocks.
- `.oxlintrc.json`/`.oxfmtrc.json` drop `e2e/inspect/**` ignore; `.gitignore` drops `e2e/__screenshots__`.
- `frontend/AGENTS.md` Browser Verification: point to `../e2e` paths and commands.

### 3. Root wiring
- `flake.nix`: `frontend-e2e` -> `e2e` (binding, script name, packages, apps), `cd "$REPO_ROOT/e2e"`.
- `.github/workflows/backend-ci.yml`: `nix run .#e2e`; npm cache key adds `e2e/package-lock.json`; comment path `frontend/e2e/isolated-test-stack.ts` -> `e2e/isolated-test-stack.ts`.
- `.graphifyignore`: update `frontend/e2e/repro/scenarios/` and `frontend/e2e/inspect/AGENTS.md` to root paths.
- `compose.test.yaml:152` comment path fix.
- Root `AGENTS.md`: Working Defaults path -> `e2e`; Local Firefox E2E Verification: run Playwright from `e2e/`.

### 4. Docs
- `docs/environments.md`: browser tests read `.env.test` through `e2e/config/tooling.ts`; browser E2E command block `cd e2e`; E2E_* values unchanged. Sentences-per-line formatting.

### 5. Verification
1. `e2e/`: npm install, npm run typecheck, lint, fmt:check.
2. `frontend/`: npm install, lint, fmt:check, typecheck, build, test:unit (AC #6).
3. From `e2e/`: full chromium-desktop run (AC #2) and `E2E_POSTGRES_ANONYMOUS_EVENT_CREATION_ENABLED=true` firefox-desktop `timed-event-postgres-plugin-firefox.spec.ts` (AC #3); Playwright owns the isolated test stack.
4. `nix flake check` (AC #7).
5. Root `npm run format:markdown` for changed Markdown (DoD #4); root `npm run fmt:check` not affected (no root JS changes).
6. `graphify update .`

### Risks / notes
- webServer cwd defaults to the config directory; set `cwd: "../frontend"` explicitly.
- Keep `dev:test` script in frontend unchanged; the e2e webServer command depends on it.
- .env.test uses `${VAR}` expansion (`APP_BASE_URL`), which vite loadEnv handles - reason for the user-decided vite dependency.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Final verification (2026-09-07): full chromium-desktop project from e2e/ passed (18 passed, 8 mobile-only skipped by design), artifacts written under /tmp/opencode/timeful-e2e-artifacts with per-run directories. One transient flake at event-page-days-only-layout.spec.ts:13 (forced #edit-event-btn click raced the async editor dialog mount; dialog never appeared) passed in isolation and on the full-project re-run with no code change; helper code is unchanged by the relocation. firefox-desktop timed-event-postgres-plugin-firefox.spec.ts passed with E2E_POSTGRES_ANONYMOUS_EVENT_CREATION_ENABLED=true. Spot checks confirmed: no frontend source imports in e2e/, landing-hero imports ./config/tooling, frontend/config/tooling.ts carries no e2e exports, frontend/package.json has no e2e wiring, root format:markdown:check green.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Moved the browser E2E suite from frontend/e2e/ to a self-contained root e2e/ package (committed as fdf928cd). The package owns the Playwright config, all specs, helpers, isolated-test-stack.ts Compose orchestration, inspect/ diagnostics, repro/ entrypoints, and their AGENTS.md guides; it has its own package.json, lockfile, tsconfig, ESLint (locator-hygiene, settle-exception, repro raw-page rules preserved), and oxfmt config, and imports no frontend source modules. frontend/ no longer carries any E2E wiring: @playwright/test, tsx, all test:e2e*/repro/inspect scripts, tsconfig.e2e.json, and the e2e ESLint/lint/fmt blocks are removed; frontend/config/tooling.ts keeps only dev-server, preview, and env helpers while e2e/config/tooling.ts holds the e2e half and loads the repo-root env contract via vite loadEnv. The Playwright webServer still starts the frontend dev server from frontend/ (cwd "../frontend" is load-bearing). flake.nix renamed frontend-e2e to e2e and backend-ci.yml references .#e2e. Docs and agent guides updated with unchanged E2E_* env contract values.

Verification: full chromium-desktop project passes from e2e/ (18 passed, 8 mobile-only skipped by design) with per-run artifacts under /tmp/opencode/timeful-e2e-artifacts; firefox-desktop timed-event-postgres-plugin-firefox passes with E2E_POSTGRES_ANONYMOUS_EVENT_CREATION_ENABLED=true; frontend lint/fmt:check/typecheck/build/test:unit green (1036 tests); nix flake check green; root format:markdown:check green. One transient flake observed at event-page-days-only-layout.spec.ts:13 (forced edit-button click racing the async dialog mount) passed in isolation and on full re-run with no code change.
<!-- SECTION:FINAL_SUMMARY:END -->
