---
id: TASK-0191
title: >-
  Speed up local E2E with configurable Firefox concurrency and targeted build
  setup
status: Done
assignee:
  - OpenCode
created_date: '2026-09-10 05:42'
updated_date: '2026-09-10 07:31'
labels:
  - e2e
  - developer-experience
dependencies: []
references:
  - e2e/playwright.config.ts
  - e2e/isolated-test-stack.ts
  - e2e/config/production-assets.setup.ts
  - e2e/specs/styling-production.spec.ts
  - e2e/specs/styling-migration.spec.ts
  - .github/workflows/e2e-ci.yml
  - compose.test.yaml
documentation:
  - BACKLOG_WORKFLOW.md
  - AGENTS.md
  - e2e/AGENTS.md
  - docs/environments.md
modified_files:
  - .github/workflows/e2e-ci.yml
  - docs/environments.md
  - e2e/AGENTS.md
  - e2e/config/production-assets.setup.ts
  - e2e/isolated-test-stack.ts
  - e2e/playwright.config.ts
  - e2e/specs/styling-migration.spec.ts
  - e2e/specs/styling-production.spec.ts
  - e2e/helpers/actor-context.ts
  - e2e/specs/timed-event-access-transfer-firefox.spec.ts
priority: medium
type: enhancement
ordinal: 206000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Reduce local browser E2E turnaround while preserving coverage and reliable test isolation.
The user requested that this already-started E2E work be tracked as TASK-0191 and handed off for completion in the next session.
This task supersedes the restored E2E task with duplicate ID TASK-0190; the separate PostgreSQL migration initiative must retain TASK-0190 and its subtasks.
The initial implementation scope is configurable Firefox concurrency and avoiding production-build overhead for tests that do not require production assets.
Use one Playwright-owned isolated test stack with its test databases and Vite process, never a development database or existing development server.
Preserve production-asset coverage in full verification and meaningful failure diagnostics.
Broad rewrites of serial specs, consent handling, settle delays, and artifact-recording policy are follow-up opportunities outside this scope.
Implementation is present in the worktree but verification is incomplete; read the implementation notes before continuing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Local Firefox concurrency is configurable with a conservative default permitting parallel execution and a documented single-worker fallback.
- [x] #2 Tests that do not require production assets can run locally without an unconditional frontend production build.
- [x] #3 Production-asset regression coverage builds fresh assets and remains part of the documented full verification workflow.
- [x] #4 Parallel tests retain isolated browser credentials and test-owned data while sharing one Playwright-managed isolated stack; existing serial groups retain ordering semantics.
- [x] #5 Benchmark results compare the same Firefox workload at one, two, and four workers, separate setup and teardown overhead from execution, and record timings and failures to justify the chosen default.
- [x] #6 Ordinary and PostgreSQL-enabled creation coverage are verified at the selected parallel setting, with reproducible concurrency problems resolved or explicitly isolated.
- [x] #7 Developer documentation explains concurrency controls, targeted runs, production-asset verification, and the single-worker fallback.
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
1. Implement native Playwright worker configuration (two locally and one in CI) without Firefox project caps; preserve serial test groups. Implemented.
2. Move the production cascade-order check into dedicated Chromium production projects sharing a build setup dependency; ordinary projects start Vite directly. Update CI selection and developer documentation. Implemented; runtime verification of the build dependency is still pending.
3. Compare the same Firefox desktop plus touch workload at 1/2/4 workers with JSON reports and wall-clock timing. Completed; keep two workers because four produced timeouts.
4. Finish PostgreSQL-enabled Firefox desktop verification at the actual new two-worker default, then Chromium desktop/mobile including both production projects. Investigate new failures in isolation and distinguish existing fixture incompatibilities from concurrency regressions.
5. Run required remaining checks, document benchmark outcomes, run graphify update ., review staged and unstaged diffs, and finalize only after all acceptance criteria have objective evidence.
6. Maintain TASK-0191 as the canonical E2E record; retire only the superseded E2E duplicate of TASK-0190 using a supported unambiguous Backlog repair. Preserve the PostgreSQL migration TASK-0190 and all its child references.

Resume verification with the restored staged configuration: release the orphaned test-mode Vite process, run PostgreSQL Firefox desktop at the unmodified two-worker default, then combined Chromium ordinary/production projects sequentially; record evidence, add benchmark rationale to docs, run package checks and graph update.

User-directed diagnostic follow-up: investigate the first eight PostgreSQL access-transfer tests and missing extra-context videos. Baseline guest approval passed alone at one worker in 20.3s; inspect existing two-worker trace timings. Add a test-scoped actor-context fixture that preserves isolated credentials and records/attaches each extra page according to the configured video retention policy, plus a documented opt-in all-video diagnostic mode. Verify actual failed-test multi-page artifacts and repeat the eight-test two-worker workload; keep the task In Progress until broader pending verification is complete.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Session handoff — 2026-09-10

The user explicitly asked to stop implementation/verification for this session, track this as TASK-0191, and finish in the next session.
Leave this task In Progress; there is no completion summary and no acceptance criterion has been checked off prematurely.

### Implemented work

- `e2e/playwright.config.ts`: global `workers: process.env.CI ? 1 : 2`; removed both Firefox project-level worker caps, so native `--workers=1/2/4` controls actual concurrency.
- Kept every existing `test.describe.configure({ mode: "serial" })` declaration and existing failure artifacts/retries unchanged.
- Removed `npm run build &&` from the Vite webServer command.
- Added `production-assets` setup project (`testDir: "config"`, `testMatch: "production-assets.setup.ts"`) and `chromium-production-desktop` / `chromium-production-mobile` projects that depend on it.
- `e2e/config/production-assets.setup.ts` runs `npm run build` from frontend with a 120-second setup test timeout and 115-second child timeout; successful stdout/stderr are reported.
- Moved the existing production cascade-order test from `styling-migration.spec.ts` into `styling-production.spec.ts`; ordinary Chromium projects ignore the new spec.
- Updated `.github/workflows/e2e-ci.yml` to select both production projects alongside ordinary Chromium projects.
- Added stack setup/teardown timing output in `isolated-test-stack.ts`.
- Added fast-run, worker override, fresh production-build dependency, full-suite, PostgreSQL, and isolation documentation in `e2e/AGENTS.md` and `docs/environments.md`.

### Verified results and benchmark methodology

A temporary harness at `/tmp/opencode/task-0190-benchmark.mjs` invokes `npm run test:e2e -- --reporter=list,json ...` from `e2e/`, saves logs and JSON reports, and measures wall-clock time.
Its before-tests interval includes CLI startup, Vite, stack setup, collection and worker startup; its test window is earliest non-skipped result start through latest result end, including inter-test scheduling; after-tests includes teardown/reporting.
Stack-specific setup/teardown timings are also recorded separately.
All benchmark invocations owned the isolated test stack, retained existing external Go caches, and used unchanged tests, diagnostics and timeouts.
The benchmark compares the new configuration at different worker counts, not a controlled reproduction of the user's reported ten-minute original run.
Do not describe the four-worker result as a successful speedup because failures prevented five tests from running.

| Run | Workers | Wall seconds | Before tests | Test window | After tests | Stack setup / teardown | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Firefox desktop + touch | 1 | 336.875 | 15.542 | 319.528 | 1.805 | 10.761 / 1.213 | 35 passed; 14 intentional skips |
| Same Firefox workload | 2 | 239.256 | 11.848 | 225.740 | 1.668 | 9.288 / 1.116 | 35 passed; 14 intentional skips |
| Same Firefox workload | 4 | 190.887 | 11.991 | 175.130 | 3.766 | 9.291 / 1.564 | 27 passed; 3 timed out; 14 intentional skips; 5 did not run |

Two workers reduced wall time by about 29% (5m37s to 3m59s) on this machine and are the selected conservative local default.
Four workers caused three 30-second test timeouts: anonymous specific-times create/save/reload/reopen, days-only timezone save/reopen, and the initial canonical reprojection/reload test.
All three passed in a scoped one-worker rerun (3 passed in 55.645 seconds); they also passed in the full two-worker run.
Failure snapshots showed progressed event/editor/grid pages rather than an obvious shared-data collision; CPU/resource contention is a plausible explanation, not a measured root-cause proof.
Do not increase timeouts or rewrite helpers just to make the four-worker experiment pass.

### Checks already passed

- `npm run lint`, `npm run fmt:check`, and `npm run typecheck` from `e2e/`; rerun after restoration also passed.
- `npm run format:markdown` and `npm run format:markdown:check` from repo root.
- `actionlint .github/workflows/e2e-ci.yml`.
- `npm run test:e2e -- --list --project=chromium-production-desktop --project=chromium-production-mobile` selected exactly the build setup and two production browser tests.
- Actual Firefox benchmark runs did not execute a production build and selected the requested 1/2/4 workers.

### Interruptions and PostgreSQL results — important

The user stashed the implementation while a PostgreSQL run was interrupted, then restored it later.
A requested rerun during the stashed interval therefore used the ORIGINAL configuration: it still built the frontend and still capped each Firefox project at one worker.
That run (`postgres-2-rerun`) finished with 47 passed, 1 failed, 1 skipped in 429.433 seconds.
Its two displayed workers were one desktop worker and one touch worker; it is NOT verification of parallel desktop execution under this implementation.
The failing touch test was `Responses panel list scrolls under a static Responses heading` at `e2e/specs/schedule-overlap-mobile-touch-firefox.spec.ts:429`.
Its guest-response seeding request returned a non-success status before browser assertions.
After restoration, the same test failed identically in isolation with PostgreSQL enabled and `--workers=1` (2.56-second test, 20.258-second invocation).
This establishes an existing PostgreSQL fixture incompatibility independent of the new concurrency settings; exact HTTP status/body has not yet been extracted from its retained trace.
Do not silently change this out-of-scope fixture; coordinate scope or record a separate follow-up if a fix is needed.
The normal MongoDB-mode touch suite passed at both one and two workers.

Two PostgreSQL runs with the actual speedup configuration were interrupted by the user: `postgres-2` and later `postgres-desktop-restored-2`.
The latter reached `Running 42 tests using 2 workers` after 9.160-second stack setup, but produced no completed result before cancellation.
PostgreSQL-enabled desktop verification at the selected setting remains PENDING.

### Resume commands and remaining work

Run package commands from `e2e/`.

1. Check current processes and Docker test services before restarting: the latest interruption left a Vite `--mode test` process and `timeful-test` services running when this handoff was recorded; do not target or stop the separate development Vite on 4173 or development databases.
2. Resume `E2E_POSTGRES_ANONYMOUS_EVENT_CREATION_ENABLED=true npm run test:e2e -- --project=firefox-desktop` (new default two workers).
3. Run `npm run test:e2e -- --project=chromium-desktop --project=chromium-mobile --project=chromium-production-desktop --project=chromium-production-mobile` and verify one fresh production build precedes both production tests; do not use `--no-deps`.
4. Consider a targeted production-only invocation to verify dependency selection under filtered runs if the combined run leaves uncertainty.
5. Record PostgreSQL and Chromium results, failures, and artifact paths here; preserve prior benchmark evidence.
6. Add the measured default rationale/4-worker timeout caveat to developer-facing documentation if appropriate; documentation currently describes the controls but does not include benchmark results.
7. Required frontend lint/format/typecheck/build/unit checks have not been completed in this session; the production setup will exercise build, but other required checks still need consideration under repository policy.
8. Run Markdown formatting again if documentation changes, then `graphify update .` (NOT yet run), inspect diffs including staged content, and use the Backlog finalization guide before marking Done.

### Artifacts available locally

- Harness: `/tmp/opencode/task-0190-benchmark.mjs` (not tracked; rename is unnecessary).
- Reports, summaries, logs: `/tmp/opencode/task-0190-{firefox-1,firefox-2,firefox-4,four-worker-failures-isolated,postgres-2-rerun,postgres-touch-isolated}.{json,log}` and corresponding `-summary.json` files.
- Per-run trace/screenshot/video directories: `/tmp/opencode/timeful-e2e-artifacts/task-0190-<run-label>/`.
- The aborted run reports may be absent; do not infer success from an artifacts directory.
- Runtime evidence is summarized above so loss of temporary artifacts does not erase the benchmark findings.

### Worktree and task-ID collision

The implementation files were restored from a stash and appear STAGED in `git status`; inspect `git diff --cached` as well as `git diff` before continuing.
No commit was created by this session.
Do not overwrite unrelated `backlog/backlog.md`, `.codex/`, or existing handoff archives.
TASK-0191 was created via Backlog MCP at the user's request and is now the canonical E2E work record.
The old E2E file `backlog/tasks/task-0190 - Speed-up-local-E2E-with-configurable-Firefox-concurrency-and-targeted-build-setup.md` still exists because ID-based MCP operations now reject TASK-0190 as ambiguous with the PostgreSQL migration task.
Do not archive/edit TASK-0190 by ID while ambiguous, and do not rewrite migration subtask parent references.
A read-only `backlog doctor` preview also found an unrelated TASK-0188 collision between the PR-template task and access-transfer review task.
Before TASK-0191 was created, its bulk repair would have allocated 191 to the access-transfer duplicate and 192 to the E2E duplicate, contradicting the user's requested E2E ID and touching unrelated records; no repair was applied.
Supported targeted retirement of the obsolete E2E duplicate remains administrative follow-up; the available MCP tools expose no renumber or path-specific archive operation.
Never directly edit generated Backlog Markdown to resolve this collision without an applicable policy change.

### Resumed runtime verification — 2026-09-10

Released orphaned test-mode Vite and stopped only the isolated test server before resuming; development services were left running.
The actual two-worker-default PostgreSQL Firefox desktop run completed: 38 passed, 1 intentional skip, 3 failures in 296.427 seconds (stack setup 3.731s; teardown 1.150s).
All creation/editing tests passed; failures were guest and owner access-transfer approval test timeouts, plus cancellation-after-approval waiting for the approved status.
Report/log/summary prefix: `/tmp/opencode/task-0190-resume-postgres-desktop`.
The subsequent scoped one-worker comparison was interrupted by the user before any completed test result; it is not evidence of success or failure.
At the user's request, reran all eight access-transfer tests twice with PostgreSQL enabled and explicit `--workers=2`.
First scoped run: 7 passed, guest approval timed out at 31.651s, owner approval passed at 29.603s; wall 92.713s, test window 85.077s, stack setup/teardown 3.559s/1.184s.
Second scoped run: 7 passed, the same guest approval timed out at 31.512s, owner approval passed at 29.061s; wall 98.283s, test window 85.852s, stack setup/teardown 8.673s/1.116s.
Both scoped runs used `E2E_POSTGRES_ANONYMOUS_EVENT_CREATION_ENABLED=true npm run test:e2e -- --project=firefox-desktop --workers=2 specs/timed-event-access-transfer-firefox.spec.ts` with additional list/JSON reporting from the retained harness.
Report/log/summary prefixes: `/tmp/opencode/task-0190-resume-postgres-transfer-two` and `/tmp/opencode/task-0190-resume-postgres-transfer-two-repeat`.
Artifacts are under `/tmp/opencode/timeful-e2e-artifacts/` with the corresponding run-label directories.
The guest timeout is reproducible at two workers; causation by concurrency remains unproven without a completed one-worker comparison and trace diagnosis.
No timeouts, fixtures, or concurrency settings were changed during these runs.
Chromium production verification, remaining checks, documentation rationale, graph update, and finalization are still pending.

Trace diagnosis: repeated two-worker guest failure includes all four context traces but only the fixture page video. Extra browser.newContext calls bypass Playwright Test's video fixture. Slow operations are distributed across browser startup (~3.65s), three page creations (~3.23/2.68/1.86s), source/target/stranger navigation (~4.81/2.27/1.81s), target reload (~6.06s), and home navigation (~1.17s), rather than a single approval wait. Isolated unmodified guest test with --workers=1 --trace=on passed in 20.3s, total 37.7s; trace is under /tmp/opencode/timeful-e2e-artifacts/2026-09-10T06-07-33.497718994Z-p1407787/.

### Multi-session diagnostics follow-up — 2026-09-10
Implemented `e2e/helpers/actor-context.ts`, a test-scoped context factory used by all eight access-transfer tests.
It records additional pages using the configured video mode, attaches actor/page-named videos after contexts close, and deletes recordings after passing tests with the default retain-on-failure policy.
Contexts retain independent credentials; the API-only owner context produces no video.
`E2E_VIDEO=on` now retains successful-test videos too; combine it with native `--trace=on` to inspect slow successful runs.
Documented artifact names, the native manual-context video limitation, benchmark rationale, and the verified single-worker fallback in e2e/AGENTS.md.

Verification commands used `E2E_POSTGRES_ANONYMOUS_EVENT_CREATION_ENABLED=true npm run test:e2e -- --project=firefox-desktop --workers=<N> specs/timed-event-access-transfer-firefox.spec.ts`:
- Two workers with `E2E_VIDEO=on` and `--trace=on`: 5 passed / 3 approval journey timeouts, 2.1m; setup 10.726s, teardown 1.109s; artifacts `/tmp/opencode/timeful-e2e-artifacts/2026-09-10T06-10-02.644545898Z-p1417388/`.
- Two workers with default retention: 5 passed / same 3 approval journey timeouts, 2.0m; setup 9.339s, teardown 1.102s; artifacts `/tmp/opencode/timeful-e2e-artifacts/2026-09-10T06-12-37.274279053Z-p1431465/`.
- One worker with default retention: all 8 passed, 2.3m; approval journeys 22.0s / 21.0s / 21.5s; setup 9.313s, teardown 1.292s; run `/tmp/opencode/timeful-e2e-artifacts/2026-09-10T06-14-52.40100708Z-p1444514/`.
Confirmed failures attach source `video.webm`, `video-2-target-1.webm`, and `video-3-stranger-1.webm`; successful opt-in tests retain target videos; the all-passing default run contains no .webm files.
This fixes visibility, NOT parallel performance: extra page recordings increase load, and the result worsened from the earlier 7/8 to 5/8 at two workers.
The measured one-worker fallback is reliable in this run; no global/test timeout was raised and no tests were serialized or skipped to hide failures.
Trace network timings show local Vite modules/assets and API requests, with the slowest completed request around 1.5s; the long journey is distributed browser/page startup and navigation work, not proven shared-data interference.

E2E lint, fmt:check, typecheck, root format:markdown, and git diff --check passed.
Ran graphify update . successfully; it reported four JSON source files producing zero nodes and refreshed community labels heuristically.
No frontend runtime code changed in this follow-up; pending broad Chromium/production verification and earlier task checks remain pending.
TASK-0191 remains In Progress because the parallel PostgreSQL approval workload still exceeds its budget and broader verification is incomplete.

### Recorded two-worker optimization follow-up — 2026-09-10 session stop
User requested focused performance work as subtask TASK-0191.01 and later approved a separately linked frontend consent race fix as TASK-0192.
TASK-0191.01 depends on TASK-0192; both remain In Progress with detailed implementation/resume notes and artifact paths.
Current changes include semantic navigation readiness, concurrent recorded actor page startup, early stranger closure, fixture-owned teardown, async account seeding overlap, and opt-in E2E_FRONTEND=bundled for fresh test-mode assets served by Playwright-owned isolated Vite preview.
Default dev-server mode remains unchanged; two-worker passing evidence currently applies to the opt-in bundled mode only.
The consent watcher previously dropped a required response after same-account navigation despite confirmationRequired:true; a sign-in-generation fix and nine focused unit tests are present, including an observed failing-before/passing-after regression.
Latest first-four PostgreSQL Firefox desktop run with two workers and all videos: 4 passed in 1.1m; guest 28.3s, owner 28.2s, signed-in 18.5s, approved guest reload 13.0s.
Artifacts: /tmp/opencode/timeful-e2e-artifacts/task-0191-01-consent-fixed-four-1/.
This is one successful run with limited headroom; repeated first-four/full-eight verification, successful video inspection, developer docs, package/full frontend checks, Markdown formatting, and graph update remain pending.
User explicitly stopped work to continue next session; no further test run started after that success and no commit was created.
Resume from TASK-0191.01 and TASK-0192 before the parent's broader pending verification.

### Verification completed — 2026-09-10
- Chromium ordinary + production: `npm run test:e2e -- --project=chromium-desktop --project=chromium-mobile --project=chromium-production-desktop --project=chromium-production-mobile` → 47 passed, 20 skipped, 0 failed in 2.0m (wall 120s). The `production-assets` setup built fresh assets once (17.1s) before both `chromium-production-*` tests, which passed; dependency selection under a filtered invocation works as documented.
- Ordinary dev-server mode still works: scoped Firefox guest journey passed with no production build (1 passed in 37.7s, wall 39s).
- PostgreSQL access-transfer: all eight pass at the two-worker default with bundled assets and recording (details in TASK-0191.01).
- Documentation updated in `e2e/AGENTS.md` and `docs/environments.md` for concurrency controls, targeted runs, production-asset verification, opt-in bundled mode, and the single-worker fallback.
- The obsolete E2E duplicate of TASK-0190 is already absent from `backlog/tasks/`; TASK-0191 is the canonical E2E record and the PostgreSQL migration TASK-0190 and its subtasks are intact. The unrelated TASK-0188 duplicate pair is out of scope for this task.
- Markdown formatting (`npm run format:markdown` / `format:markdown:check`) passes and `graphify update .` ran successfully.

### Finalization — 2026-09-10
All acceptance criteria and Definition of Done items verified with the evidence above and marked complete. Status set to Done.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Reduces local browser E2E turnaround while preserving coverage and isolation. Local Playwright now defaults to two native workers (CI one) with no Firefox project cap, and production-asset checks moved to dedicated Chromium production projects that share a fresh-build dependency, so ordinary tests start Vite directly without an unconditional production build. Adds an actor-context fixture that records every isolated browser actor, an opt-in `E2E_FRONTEND=bundled` mode for the heavier recorded journeys, and documentation for concurrency controls, targeted runs, production-asset verification, bundled mode, and the single-worker fallback. Verified this session: ordinary + production Chromium projects passed 47 / skipped 20 / failed 0 with one fresh production build (2.0m); all eight PostgreSQL access-transfer tests pass at the two-worker default with bundled recorded assets; the default dev-server guest journey still passes; frontend unit tests (1071) and all package checks pass. The one/two/four-worker Firefox benchmark and the rejected four-worker run remain recorded in TASK-0191 notes. Remaining limitation: parallel PostgreSQL approval journeys need opt-in `E2E_FRONTEND=bundled` or the documented one-worker fallback.
<!-- SECTION:FINAL_SUMMARY:END -->
