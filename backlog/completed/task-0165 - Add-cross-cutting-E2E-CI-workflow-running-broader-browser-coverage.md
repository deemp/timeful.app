---
id: TASK-0165
title: Add cross-cutting E2E CI workflow running broader browser coverage
status: Done
assignee:
  - opencode
created_date: '2026-09-06 15:49'
updated_date: '2026-09-08 13:06'
labels:
  - e2e
  - ci
dependencies:
  - TASK-0164
references:
  - .github/workflows/backend-ci.yml
  - .github/workflows/frontend-ci.yml
  - flake.nix
documentation:
  - docs/environments.md
  - .github/workflows/backend-ci.yml
  - AGENTS.md
priority: medium
type: chore
ordinal: 176300
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Browser E2E signal is currently lopsided: frontend CI never runs E2E, and Backend CI runs exactly one Firefox spec (timed-event-postgres-plugin-firefox). A server change that breaks browser flows gets no E2E signal. After TASK-0164 relocates the suite to the root e2e package (providing nix run .#e2e), a cross-cutting E2E workflow should give both frontend and server changes browser-level coverage.

Outcome: a new E2E CI workflow triggered by frontend, server, e2e, compose, env-test, and flake changes runs the broad E2E suite in CI, replacing the single-spec browser step in Backend CI.

Confirmed decisions and constraints:
- Scope per user decision: start with the chromium projects (chromium-desktop, chromium-mobile) plus the relocated postgres-plugin Firefox spec; the full Firefox suite (workers:1, slow) stays local-only for now and can be added later.
- The workflow should mirror Backend CI's proven isolated-stack setup (Buildx-cached server test image, cached migrator image, external Go cache volumes, npm cache) rather than reinventing it; duplication of those steps between workflows is acceptable unless a reusable workflow is straightforward.
- The isolated test stack rules still apply: browser E2E always targets the test stack on 3003 and never a development database.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A new e2e CI workflow (e.g. .github/workflows/e2e-ci.yml) exists with path triggers on frontend/**, server/**, e2e/**, compose*.yaml, .env.test.example, and the Nix flake
- [x] #2 The workflow runs nix run .#e2e over the chromium-desktop and chromium-mobile projects and they pass on a clean runner
- [x] #3 The firefox-desktop timed-event-postgres-plugin-firefox spec moves from backend-ci.yml into the new workflow, and backend-ci.yml no longer runs browser E2E itself
- [x] #4 The workflow reuses the hardened cache setup proven in backend-ci.yml (buildx GHA cache for the server test image, migrator image tarball, external Go build/module cache volumes, npm cache) so server compilation stays incremental
- [x] #5 actionlint passes on the new workflow, consistent with the repo's workflow linting enforcement
- [x] #6 backend-ci.yml and frontend-ci.yml trigger/concurrency configuration remain correct after the browser step moves (no job reruns the same e2e scope twice on one push)
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

### Design (per pre-confirmed task decisions)
Duplicate backend-ci.yml's hardened setup into a new `.github/workflows/e2e-ci.yml` (no reusable workflow: user decision allows duplication; a reusable workflow is not straightforward). Playwright owns the isolated stack (e2e/isolated-test-stack.ts boots `up -d --build mongo-test postgres-test postgres-test-bootstrap server-test` and tears down), so the workflow only pre-warms caches and pre-completes migration so globalSetup does not rebuild the migrator.

### 1. New `.github/workflows/e2e-ci.yml`
- Triggers: pull_request + push(main) with paths `frontend/**`, `server/**`, `e2e/**`, `compose*.yaml`, `.env.test.example`, `flake.nix`, `flake.lock`, and the workflow file itself. Concurrency `e2e-ci-${{ github.ref }}`, cancel-in-progress. Job `permissions: contents: read`.
- Steps copied verbatim from backend-ci.yml where proven: checkout, nix-quick-install + cache-nix-action, `cp .env.test.example .env.test`, `docker compose config --quiet`, setup-buildx, buildx server test image (target testbase, tags `timeful-test-server-route-test`, gha cache; keeps the shared cache scope warm), migrator tarball restore/build/save, Go build+mod cache restore, npm cache restore (frontend+e2e lockfiles), seed external Go cache volumes, `up -d mongo-test postgres-test postgres-test-bootstrap postgres-test-migrate` (no --build; migrator image used as-is so globalSetup's depends_on condition is already satisfied).
- E2E steps: `nix run .#e2e -- --project=chromium-desktop --project=chromium-mobile`, then (moved from backend-ci, same env) `E2E_POSTGRES_ANONYMOUS_EVENT_CREATION_ENABLED=true nix run .#e2e -- --project=firefox-desktop specs/timed-event-postgres-plugin-firefox.spec.ts`.
- Tail steps: Save Go caches (if: always(), comment updated - the E2E server `go run` compile is now captured), one-shot logs on failure, `down -v` teardown (if: always()).
- Job `timeout-minutes: 60` hygiene for the browser suite (backend job has none, but this suite has more moving parts).

### 2. backend-ci.yml browser-step removal (AC #3/#6)
- Remove the "Run PostgreSQL browser lifecycle test" step.
- Remove the now-unused nix-quick-install/cache-nix-action and "Restore npm cache" steps (only the E2E step consumed nix/npm); backend CI is pure Docker/Go afterwards.
- Update "Save Go caches" comment (it referenced capturing E2E `go run` compile work).
- Triggers/concurrency unchanged.

### 3. Docs
- `docs/ci.md`: add E2E CI row to the workflows table (one physical line per row).

### 4. Verification
1. `actionlint` from repo root (AC #5).
2. Run the workflow's exact commands locally from repo root: `nix run .#e2e -- --project=chromium-desktop --project=chromium-mobile`, then `E2E_POSTGRES_ANONYMOUS_EVENT_CREATION_ENABLED=true nix run .#e2e -- --project=firefox-desktop specs/timed-event-postgres-plugin-firefox.spec.ts` (Playwright owns the isolated test stack on 3003/4174; AC #2/#3 evidence; full-runner CI execution can only be observed after merge).
3. `npm run format:markdown` + `format:markdown:check` for docs/ci.md (DoD #4).
4. `graphify update .` (workflow/config-only change; graph does not track .github, run for completeness).
5. No frontend source changes: frontend required checks not triggered; no unit tests apply (workflow/docs change only).

### Risks / notes
- `docker compose up -d --build ... server-test` in globalSetup rebuilds the migrator unless the pre-start step completed it first; the pre-start step must not be dropped.
- The buildx-built `timeful-test-server-route-test` image is not consumed by e2e-ci directly; keeping the step preserves the shared gha cache scope with backend-ci and matches AC #4.
- testbase target has no RUN/COPY layers, so globalSetup's compose build of server-test is cheap; incremental server compilation comes from the seeded Go cache volumes.
- Known gap (outside this task): `.github/dependabot.yml` lacks an `/e2e` npm ecosystem entry (from TASK-0164 relocation).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
User decisions 2026-09-08: (1) e2e-ci.yml WILL upload Playwright failure artifacts (traces/screenshots/videos) via E2E_ARTIFACTS_DIR under runner.temp, upload on failure with retention-days 7 and if-no-files-found ignore; (2) backend-ci.yml unused nix-quick-install/cache-nix-action and npm cache steps will be removed along with the browser step (backend CI becomes pure Docker/Go); (3) missing /e2e npm ecosystem in dependabot.yml handled as a separate follow-up task, not in this task.

2026-09-08 resumed-session verification: the chromium-mobile blocker from the prior handoff (event-toolbar-mobile-layout width 32 < 100) was fixed by commit 472073e1 (menuButtonSize -> menuButtonHeight, TASK-0182); that commit records the full chromium desktop+mobile run passing 46 passed / 0 failed with the exact workflow command.

Re-ran the moved Firefox step locally from repo root: E2E_POSTGRES_ANONYMOUS_EVENT_CREATION_ENABLED=true nix run .#e2e -- --project=firefox-desktop specs/timed-event-postgres-plugin-firefox.spec.ts -> 1 passed (40.8s).

actionlint passes on all workflows (AC #5). npm run format:markdown + format:markdown:check pass for docs/ci.md (DoD #4). graphify update . run for completeness.

AC #2 note: clean-runner passes are observable only post-merge; the plan defines the local run of the exact command as the AC #2/#3 evidence. DoD #2/#3: workflow/docs-only change, no unit tests apply; both E2E commands pass.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Add a cross-cutting E2E CI workflow so frontend and server changes get browser-level coverage.

- New `.github/workflows/e2e-ci.yml`: triggers on pull_request and push(main) with paths `frontend/**`, `server/**`, `e2e/**`, `compose*.yaml`, `.env.test.example`, `flake.nix`, `flake.lock`, and the workflow file itself; concurrency `e2e-ci-<ref>` (cancel-in-progress); `browser-e2e` job with `contents: read` and `timeout-minutes: 60`. It mirrors Backend CI's hardened isolated-stack setup (Buildx+GHA-cached server test image, migrator image tarball, Go build/module caches, npm cache, seeded external Go cache volumes, no-`--build` pre-start so globalSetup does not rebuild the migrator), then runs `nix run .#e2e -- --project=chromium-desktop --project=chromium-mobile` and the moved `E2E_POSTGRES_ANONYMOUS_EVENT_CREATION_ENABLED=true nix run .#e2e -- --project=firefox-desktop specs/timed-event-postgres-plugin-firefox.spec.ts`. Playwright failure artifacts (via `E2E_ARTIFACTS_DIR`) upload on failure with 7-day retention.
- `.github/workflows/backend-ci.yml`: removed the browser E2E step plus the now-unused nix-quick-install/cache-nix-action and npm cache steps; Backend CI is pure Docker/Go. Triggers and concurrency unchanged; `frontend-ci.yml` untouched, so no e2e scope runs twice on one push.
- `docs/ci.md`: added an E2E CI row to the workflows table.

Verification: `actionlint` passes repo-wide. The workflow's exact commands were run locally with Playwright owning the isolated test stack: the Chromium desktop+mobile run passes (46 passed, 0 failed, verified on commit 472073e1 after it fixed the pre-existing mobile toolbar regression the new coverage exposed), and the Firefox postgres-plugin spec passes (1 passed, 40.8s). `npm run format:markdown` + `format:markdown:check` pass on `docs/ci.md`. Clean-runner behavior of the new workflow can only be observed after merge.

Follow-up: TASK-0181 tracks adding the `/e2e` npm ecosystem to `.github/dependabot.yml`.
<!-- SECTION:FINAL_SUMMARY:END -->
