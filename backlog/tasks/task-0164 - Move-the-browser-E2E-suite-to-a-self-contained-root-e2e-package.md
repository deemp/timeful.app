---
id: TASK-0164
title: Move the browser E2E suite to a self-contained root e2e package
status: In Progress
assignee:
  - opencode
created_date: '2026-09-06 15:48'
updated_date: '2026-09-07 10:28'
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
- [ ] #1 A self-contained e2e/ package exists at the repository root containing the Playwright config, all specs, helpers, isolated-test-stack.ts, inspect/, repro/, and their AGENTS.md guides; frontend/e2e no longer exists
- [ ] #2 Running npm run test:e2e from e2e/ boots the isolated Compose test stack (mongo-test, postgres-test, server-test) plus the frontend Vite dev server, the full chromium-desktop project passes, and per-run artifact directories under /tmp/opencode/timeful-e2e-artifacts (with E2E_ARTIFACTS_DIR override) still work
- [ ] #3 The firefox-desktop timed-event-postgres-plugin-firefox spec passes when run from the new e2e/ package
- [ ] #4 The e2e package has its own package.json, lockfile, tsconfig, ESLint config preserving the locator-hygiene, settle-exception, and repro raw-page rules, and oxfmt config; it imports no frontend source modules; the Playwright webServer still starts the frontend dev server from frontend/
- [ ] #5 frontend/config/tooling.ts retains only frontend dev-server, preview, and env helpers; e2e-only tooling (tooling mode, isolated E2E network, healthcheck URL, artifacts dir, Playwright config factory) lives in the e2e package; the e2e package loads the documented repo-root env contract through vite loadEnv (user decision 2026-09-07: keep the vite dependency rather than hand-roll a dotenv parser); vite.config.ts behavior is unchanged
- [ ] #6 frontend/ cleanup removes the @playwright/test dependency, all test:e2e*/repro/inspect scripts, tsconfig.e2e.json and its typecheck segment, e2e lint/fmt globs, and e2e ESLint blocks; npm run lint, fmt:check, typecheck, build, and test:unit all pass in frontend/
- [ ] #7 flake.nix provides .#e2e (renamed from .#frontend-e2e) running npm ci and the e2e suite from e2e/, and .github/workflows/backend-ci.yml references .#e2e; nix flake check passes
- [ ] #8 The landing-hero spec determines landing sign-in expectations from the documented env contract without importing frontend source code
- [ ] #9 Docs updated: root AGENTS.md E2E sections, frontend/AGENTS.md Browser Verification, e2e/AGENTS.md and e2e/inspect/AGENTS.md paths, and docs/environments.md commands; the E2E_* environment variable contract values are unchanged
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 All acceptance criteria are satisfied
- [ ] #2 All required unit tests pass. Documentation-only changes are exempt unless the user requests unit tests
- [ ] #3 All required e2e tests pass. Documentation-only changes are exempt unless the user requests e2e tests
- [ ] #4 Changed Markdown files are formatted with npm run format:markdown
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
User decision 2026-09-07: the e2e package keeps loading the root env contract via vite `loadEnv` (as isolated-test-stack.ts already does) instead of a hand-rolled dotenv-based loader; AC #5 updated to drop the "no vite dependency" constraint because reusing vite is more maintainable.

Review of the staged work (2026-09-07) found and fixed four problems, all verified and staged:
1. `frontend/tsconfig.json` still referenced the deleted `tsconfig.e2e.json`, breaking `npm run build` (TS5083) and all 140 vitest suites (`TSCONFIG_ERROR` via tsconfck); removed the reference entry.
2. The flake `e2e` script only ran `npm ci` in `e2e/`, but the Playwright webServer starts `npm run dev:test` from `../frontend`, which needs frontend dependencies (CI has no other frontend install step); the script now installs frontend deps first.
3. The two oxlint `prefer-nullish-coalescing` errors in `e2e/config/tooling.ts` were fixed with a `nonBlankOr` helper that preserves blank-string fallthrough; converting to Temporal also revealed a previously masked eslint temporal violation there (`config/` was outside the old frontend lint scope), so `new Date().toISOString()` became `Temporal.Now.instant().toString()` in the run-id fallback.
4. The fresh e2e lockfile resolved `@playwright/test` 1.63.0 while nixpkgs `playwright-driver` is 1.61.1 (browser-revision mismatch risk for `nix run .#e2e`); `e2e/package.json` now pins it exactly at 1.61.0 and the lockfile was regenerated.
Also added a bootstrap bullet to `e2e/AGENTS.md` (`npm ci` in both `e2e/` and `../frontend` before the first run).

Post-fix verification: e2e lint/fmt:check/typecheck green and `playwright test --list` collects 86 tests in 20 files; frontend lint/fmt:check/typecheck/build/test:unit all green (140 files, 1036 tests); `nix flake check` green; root `format:markdown:check` green; `graphify update .` run; all changes staged. Still outstanding: the Docker-backed suite runs (chromium-desktop full pass for AC #2, firefox-desktop timed-event-postgres-plugin-firefox for AC #3) before finalization.

Execution facts from the relocation session (2026-09-07, recorded from the handoff so they survive beyond it):
- `e2e/.npmrc` with `legacy-peer-deps=true` mirrors `frontend/.npmrc` and is required: `typescript-eslint` peer ranges reject the `typescript-native-bridge` alias version.
- All e2e dependencies are declared as devDependencies; the package is private and always installed via `npm ci`.
- `webServer.cwd: "../frontend"` is load-bearing: Playwright defaults the webServer cwd to the config directory, so the explicit value must not be dropped.
- The assumed overlap of e2e markdown in both the e2e oxfmt scope and the root Prettier sentences-per-line pipeline was validated: root `format:markdown:check` and e2e `fmt:check` both pass.
- Flattened-layout rationale: `testDir: "."` is safe because Playwright's test collector skips `node_modules` (verified in playwright/lib/runner/index.js:2236).
- Session-state detail for the relocation work remains in `backlog/handoffs/handoff-2026-09-07T09-59-38Z.md`; the plan section above holds the authoritative step list.
<!-- SECTION:NOTES:END -->
