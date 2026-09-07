---
id: TASK-0168
title: Move e2e spec files into an e2e/specs subdirectory
status: Done
assignee: []
created_date: '2026-09-07 11:18'
updated_date: '2026-09-07 11:26'
labels: []
dependencies: []
priority: medium
type: chore
ordinal: 177300
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Declutter the root of the self-contained `e2e/` package by moving all `e2e/*.spec.ts` files into a new `e2e/specs/` subdirectory, keeping `playwright.config.ts`, `isolated-test-stack.ts` (globalSetup), `config/`, `helpers/`, `repro/`, and `inspect/` at the package root.

Scope:
- Move all 19 root-level `e2e/*.spec.ts` files to `e2e/specs/` (git mv).
- Update spec imports from `./helpers/...` and `./config/tooling` to `../`-prefixed paths.
- Point Playwright `testDir` at `specs/`; keep globalSetup, webServer, and per-project `testMatch`/`testIgnore` basename regexes working.
- Update `e2e/tsconfig.json` include, the backend CI e2e filter path, and the `e2e/inspect/AGENTS.md` / `e2e/AGENTS.md` references to spec locations.
- Do not move `isolated-test-stack.ts`, `helpers/`, `repro/`, `inspect/`, or `config/`.

Out of scope: renaming specs, changing test contents beyond import paths, frontend/server code changes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 All `e2e/*.spec.ts` files live under `e2e/specs/` and no spec files remain at the `e2e/` package root
- [x] #2 Playwright discovers and runs the specs from `e2e/specs/` with unchanged project assignments (chromium-desktop, chromium-mobile, firefox-desktop, firefox-touch) and artifacts still land under /tmp/opencode/timeful-e2e-artifacts
- [x] #3 `npm run lint`, `npm run fmt:check`, and `npm run typecheck` pass from `e2e/`
- [x] #4 Full `chromium-desktop` project run passes from `e2e/`, and the CI-path command `E2E_POSTGRES_ANONYMOUS_EVENT_CREATION_ENABLED=true npm run test:e2e -- --project=firefox-desktop specs/timed-event-postgres-plugin-firefox.spec.ts` passes
- [x] #5 Backend CI workflow and e2e docs reference the updated spec locations
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
1. `git mv` all 19 root-level `e2e/*.spec.ts` files into a new `e2e/specs/` directory.
2. Rewrite spec-internal imports: `./helpers/...` → `../helpers/...`, `./config/tooling` → `../config/tooling` (19 files).
3. `e2e/playwright.config.ts`: `testDir: "."` → `testDir: "specs"`; keep `globalSetup: "./isolated-test-stack.ts"` (config-level path stays package-root relative); project `testMatch`/`testIgnore` regexes match basenames so they keep working; `snapshotPathTemplate` keeps `{testDir}` token so it follows automatically.
4. `e2e/tsconfig.json`: add `"specs/**/*.ts"` to `include`.
5. `.github/workflows/backend-ci.yml`: e2e step filter `timed-event-postgres-plugin-firefox.spec.ts` → `specs/timed-event-postgres-plugin-firefox.spec.ts`.
6. Docs: `e2e/inspect/AGENTS.md` references `e2e/*.spec.ts` → `e2e/specs/*.spec.ts`; check `e2e/AGENTS.md` wording.
7. No changes expected for `e2e/eslint.config.ts` (`**/*.spec.ts` already matches nested), `.oxlintrc.json`, `.oxfmtrc.json`, `flake.nix` (cd's into `e2e/` and delegates to npm scripts), `repro/` and `inspect/` (import `../helpers`, not specs).
8. Verify: `npm run lint`, `npm run fmt:check`, `npm run typecheck` from `e2e/`; full `chromium-desktop` run; CI-path firefox-desktop postgres-plugin spec run; `npm run format:markdown`; `graphify update .`.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Moved all 20 `e2e/*.spec.ts` files into a new `e2e/specs/` subdirectory (git mv, history preserved as renames); the e2e package root now holds only `playwright.config.ts`, `isolated-test-stack.ts` (globalSetup), `config/`, `helpers/`, `repro/`, `inspect/`, and package metadata.

Changes:
- e2e/playwright.config.ts: `testDir: "."` → `testDir: "specs"`. globalSetup, webServer (cwd ../frontend), and the per-project `testMatch`/`testIgnore` basename regexes are unchanged and keep working; `snapshotPathTemplate` uses the `{testDir}` token so snapshots follow to `e2e/specs/__screenshots__/` (none checked in; e2e/.gitignore matches at any depth).
- All 20 specs: relative imports rewritten from `./helpers/...` and `./config/tooling` to `../helpers/...` / `../config/tooling` (verified no other relative imports exist).
- e2e/tsconfig.json: added `specs/**/*.ts` to include.
- .github/workflows/backend-ci.yml: backend CI e2e step now runs `nix run .#e2e -- --project=firefox-desktop specs/timed-event-postgres-plugin-firefox.spec.ts`.
- e2e/AGENTS.md: documented the layout (specs in `e2e/specs/`, tooling stays at package root). e2e/inspect/AGENTS.md: both `e2e/*.spec.ts` references updated to `e2e/specs/*.spec.ts`.

No changes needed: e2e/eslint.config.ts (`**/*.spec.ts` already matches nested files, so locator-hygiene rules still apply), .oxlintrc.json, .oxfmtrc.json, flake.nix (cd's into `e2e/` and delegates to npm scripts), repro/ and inspect/ (they import `../helpers`, not specs). Historical references to old spec paths in backlog/ records and handoffs were intentionally left untouched.

Verification evidence (2026-09-07):
- From e2e/: `npm run lint` (oxlint + eslint), `npm run fmt:check` (41 files), and `npm run typecheck` (tsc) all pass.
- Full `npm run test:e2e -- --project=chromium-desktop` run: 18 passed, 8 skipped (mobile-only by design), matching the pre-move baseline; specs discovered from `specs/` with unchanged project assignments, isolated test stack and Vite started normally, artifacts root still /tmp/opencode/timeful-e2e-artifacts with per-run directories.
- CI-path command `E2E_POSTGRES_ANONYMOUS_EVENT_CREATION_ENABLED=true npm run test:e2e -- --project=firefox-desktop specs/timed-event-postgres-plugin-firefox.spec.ts`: 1 passed.
- `npm run format:markdown` made no changes to the edited Markdown; `graphify update .` rebuilt the graph (4919 nodes, 8069 edges).

Not committed; changes left in the worktree.
<!-- SECTION:FINAL_SUMMARY:END -->
