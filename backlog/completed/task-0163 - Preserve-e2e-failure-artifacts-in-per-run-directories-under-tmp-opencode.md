---
id: TASK-0163
title: Preserve e2e failure artifacts in per-run directories under /tmp/opencode
status: Done
assignee: []
created_date: '2026-09-06 14:52'
updated_date: '2026-09-06 14:52'
labels:
  - e2e
  - playwright
  - developer-experience
dependencies: []
modified_files:
  - frontend/playwright.config.ts
  - frontend/config/tooling.ts
  - frontend/e2e/AGENTS.md
type: enhancement
ordinal: 174300
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Sessions diagnosing e2e failures looked for artifacts under /tmp while Playwright wrote them to the repo-local frontend/tmp/playwright and wiped them at the start of every run, so traces, error contexts, screenshots, and videos from past runs were unavailable exactly when needed.

Store Playwright test output outside the workspace in directories that survive across runs so any invocation stays independently inspectable.

Constraints:
- Keep trace retention on failure for every failed test, local and CI.
- Default artifacts root is /tmp/opencode/timeful-e2e-artifacts (os.tmpdir aware), overridable with E2E_ARTIFACTS_DIR.
- Never clean past run directories automatically; cleanup stays manual.
- One artifacts directory per test:e2e invocation, even though Playwright evaluates the config in the main process and again in every worker process.
- Keep snapshot baselines in-repo; only test result output moves.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Failed e2e tests save trace.zip, error-context.md, a failure screenshot, and a video in the test result directory, including local runs with zero retries.
- [x] #2 Each test:e2e invocation writes all artifacts into exactly one run directory under /tmp/opencode/timeful-e2e-artifacts/, and past run directories are never cleaned automatically.
- [x] #3 E2E_ARTIFACTS_DIR overrides the artifacts root.
- [x] #4 frontend/e2e/AGENTS.md documents artifact locations, latest-run lookup, manual cleanup, and the only conditions where error-context.md can be absent.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 All acceptance criteria are satisfied
- [x] #2 All required unit tests pass. Documentation-only changes are exempt unless the user requests unit tests
- [x] #3 All required e2e tests pass. Documentation-only changes are exempt unless the user requests e2e tests
- [x] #4 Changed Markdown files are formatted with npm run format:markdown
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Moved Playwright outputDir from repo-local frontend/tmp/playwright (wiped every run) to preserved per-run directories under /tmp/opencode/timeful-e2e-artifacts/<run-id>/ (default, E2E_ARTIFACTS_DIR overrides).

- frontend/config/tooling.ts: createFrontendPlaywrightArtifactsDir() generates a colon-free ISO-timestamp run id and republishes it via E2E_ARTIFACTS_RUN_ID. This is required because Playwright 1.61 re-evaluates playwright.config.ts in every worker process (workerProcessEntry.js); workers inherit process.env (runner/index.js:1858) and reuse the main process's run id, so one invocation produces exactly one artifacts directory instead of one per worker.
- frontend/playwright.config.ts: outputDir uses the helper; screenshot "only-on-failure" and video "retain-on-failure" added alongside the existing trace "retain-on-failure".
- Verified against the installed runner source and empirically: error-context.md is written for every failed test that finishes normally, including assertion failures, action failures, thrown errors, failures after the page closed, and beforeAll hook failures. Expect-matcher failures embed the element's ARIA snapshot in Error details; other failures get a whole-page snapshot fallback only when a page is still open. Only a worker crash or an interrupted run can omit the file.
- A real failing e2e run produced trace.zip, error-context.md, test-failed-1.png, and video.webm together in one run directory.
- frontend/e2e/AGENTS.md documents artifact locations, latest-run lookup, manual cleanup, and the error-context.md caveats.

Checks: lint, fmt:check, typecheck, build, test:unit (1034 passed), format:markdown; e2e smoke on chromium-mobile passed. Two transient cold-start flakes observed during verification (navigation timeout, then a closed page) re-ran green; their failure artifacts made diagnosis immediate.
<!-- SECTION:FINAL_SUMMARY:END -->
