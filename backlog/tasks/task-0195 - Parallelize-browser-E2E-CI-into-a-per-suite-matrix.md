---
id: TASK-0195
title: Parallelize browser E2E CI into a per-suite matrix
status: In Progress
assignee:
  - opencode
created_date: '2026-09-10 08:38'
updated_date: '2026-09-10 08:41'
labels:
  - e2e
  - ci
  - playwright
dependencies: []
references:
  - .github/workflows/e2e-ci.yml
  - e2e/playwright.config.ts
  - flake.nix
  - e2e/isolated-test-stack.ts
documentation:
  - docs/ci.md
  - e2e/AGENTS.md
  - docs/environments.md
priority: medium
type: enhancement
ordinal: 211000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
E2E CI currently runs all browser suites sequentially in a single `browser-e2e` job: one `nix run .#e2e` invocation for the Chromium projects (~4 minutes), one for the PostgreSQL-enabled Firefox desktop project, and one for the Firefox touch project, on top of ~1.5 minutes of job setup. The wall-clock cost is roughly the sum of the suites plus repeated per-invocation overhead (`npm ci`, stack bring-up, Vite start, and `down -v` teardown). This task delivers the user-requested speedup.

Outcome: `.github/workflows/e2e-ci.yml` runs the Chromium, Firefox desktop, and Firefox touch suites as independent jobs driven by a `strategy.matrix`, so the wall-clock approaches job setup plus the slowest single suite instead of the sum of all suites.

Confirmed decisions and constraints:
- The stated priority is minimizing E2E CI wall-clock time, even though parallel jobs duplicate setup compute.
- Chromium and Firefox desktop run at two Playwright workers; Firefox touch stays at one worker because it matches a single serial spec file that cannot parallelize further.
- The Firefox desktop job enables `E2E_FRONTEND=bundled` so the heavier PostgreSQL access-transfer journeys stay within budget at two workers; if that proves flaky in CI, fall back to one worker and record why.
- PostgreSQL anonymous event creation is a stack-level setting consumed at global setup, so the Firefox desktop suite must remain its own job and must not share an invocation with Mongo-backed suites.
- Firefox touch keeps the default Mongo-backed creation mode because its spec seeds guest responses through the standalone request fixture, which carries no PostgreSQL creation credential.
- Each job runs on its own runner with its own isolated test stack (`mongo-test`, `postgres-test`, `server-test`) on the fixed isolated ports; browser E2E never targets a development database.
- Caches must have a single writer: every job restores the Nix, Go, and npm caches, but exactly one designated job saves them so concurrent same-key saves cannot race.
- Playwright failure artifacts must upload under a job-specific name so parallel uploads do not collide.
- Preserve the existing pull request and push path filters, the workflow concurrency group with cancel-in-progress, and the isolated-stack teardown behavior.
- Update the CI documentation to describe the parallel structure.

Reference baseline: on run 34453841622 the Chromium suite took exactly 4 minutes while three suites ran sequentially in one job.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 E2E CI runs the Chromium, Firefox desktop, and Firefox touch browser suites as independent jobs that execute in parallel instead of sequentially in a single job.
- [ ] #2 The Chromium job runs the chromium-desktop, chromium-mobile, chromium-production-desktop, and chromium-production-mobile projects at two Playwright workers.
- [ ] #3 The Firefox desktop job runs with PostgreSQL anonymous event creation enabled and the bundled test-mode frontend at two Playwright workers, or records why it falls back to one worker.
- [ ] #4 The Firefox touch job retains the Mongo-backed event creation mode.
- [ ] #5 Every browser job owns an isolated test stack and no job targets a development database or shares fixed ports with another job.
- [ ] #6 The Nix, Go, and npm caches restore in every browser job, while exactly one designated job saves each cache.
- [ ] #7 Each browser job uploads Playwright failure artifacts under a job-specific artifact name.
- [ ] #8 E2E CI wall-clock time is materially below the sequential baseline, with before/after run durations recorded.
- [ ] #9 actionlint passes on the modified workflow.
- [ ] #10 docs/ci.md and e2e/AGENTS.md document the parallel suite structure, the CI worker counts, and the CI frontend mode.
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
## Implementation plan

1. Convert the single `browser-e2e` job in `.github/workflows/e2e-ci.yml` into a `strategy.matrix` job (`fail-fast: false`) with one entry per suite:
   - `chromium`: four Chromium projects, `workers: 2`, default dev-server frontend, Mongo creation, designated cache writer.
   - `firefox-desktop`: `firefox-desktop`, `workers: 2`, `E2E_FRONTEND=bundled`, `E2E_POSTGRES_ANONYMOUS_EVENT_CREATION_ENABLED=true`.
   - `firefox-touch`: `firefox-touch`, `workers: 1`, default frontend, Mongo creation.
   Parameterize the three `nix run .#e2e` invocations from the matrix and add `--workers=<n>`, `E2E_FRONTEND`, and the PostgreSQL flag per entry.
2. Enforce single-writer caches. Every job restores all caches; only the `chromium` entry sets `save-cache: true`.
   - Nix: pass `save: ${{ matrix.save-cache }}` to `cache-nix-action`.
   - Buildx gha: gate `cache-to` on `matrix.save-cache` (`cache-from` stays on every job).
   - Migrator image tar and npm caches: split the monolithic `actions/cache` steps into `actions/cache/restore` plus a conditional `actions/cache/save` (primary-key != matched-key).
   - Go build/module caches: keep the existing copy-out/save steps and add `matrix.save-cache` to their conditions.
3. Make the Playwright failure artifact name job-specific: `playwright-failure-artifacts-${{ matrix.suite }}`.
4. Preserve the pull-request and push path filters, the `concurrency` group with `cancel-in-progress`, and the final `down -v` isolated-stack teardown. Each matrix job runs on its own runner, so its fixed isolated ports and `timeful-test` Compose project do not collide.
5. Run `actionlint` on the modified workflow.
6. Update `docs/ci.md` and `e2e/AGENTS.md` to document the parallel suite matrix, CI worker counts (2/2/1), and the CI frontend mode (bundled for Firefox desktop).
7. Objective verification for AC #8: push the change to the open `speed-up-e2e` PR branch, record the parallel run's total wall-clock and per-suite step durations from `gh run view`, and compare against baseline run 34453841622. Record all durations in the task.

## Risks / notes

- Concurrent same-key cache saves are avoided by the single designated writer; other jobs restore only.
- Firefox desktop two-worker flakiness is the main risk; if access-transfer journeys time out, fall back to `workers: 1` for that entry and record why.
<!-- SECTION:PLAN:END -->
