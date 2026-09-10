---
id: TASK-0193
title: Run the Firefox E2E projects in E2E CI
status: Done
assignee:
  - '@opencode'
created_date: '2026-09-10 07:47'
updated_date: '2026-09-10 08:08'
labels:
  - e2e
  - ci
  - playwright
dependencies: []
references:
  - >-
    backlog/tasks/task-0165 -
    Add-cross-cutting-E2E-CI-workflow-running-broader-browser-coverage.md
documentation:
  - .github/workflows/e2e-ci.yml
  - e2e/playwright.config.ts
  - e2e/AGENTS.md
  - docs/ci.md
  - flake.nix
priority: medium
type: enhancement
ordinal: 209000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
E2E CI currently runs the full Chromium suites but only one Firefox spec (timed-event-postgres-plugin-firefox.spec.ts). The chromium projects testIgnore every timed-event-.*firefox spec, so the firefox-desktop timezone/PostgreSQL specs and the firefox-touch touch spec have no CI coverage at all. TASK-0165 deliberately deferred them ("the full Firefox suite stays local-only for now and can be added later"); this task delivers that follow-up.

Outcome: .github/workflows/e2e-ci.yml runs the firefox-desktop and firefox-touch projects against the isolated test stack, with PostgreSQL anonymous event creation enabled so the PostgreSQL-gated specs (postgres plugin, owner authority, visitor identities, access transfer) execute instead of skipping. The existing standalone postgres-plugin Firefox step is folded into the project run so no Firefox spec runs twice. Browser provisioning already exists via the Nix `e2e` app (flake.nix points PLAYWRIGHT_BROWSERS_PATH at pkgs.playwright-driver.browsers), so no new infrastructure is needed.

Constraints:
- Browser E2E always targets the isolated test stack; never a development database.
- CI keeps workers:1 (Playwright's CI default) because the access-transfer Firefox journeys are heavy at higher concurrency.
- Keep the existing Chromium project coverage unchanged.
- Record the CI scope change in docs/ci.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 E2E CI runs the full firefox-desktop project against the isolated test stack
- [x] #2 E2E CI runs the firefox-touch project against the isolated test stack
- [x] #3 The PostgreSQL-gated Firefox specs execute (not skip) in CI: timed-event-postgres-plugin-firefox, timed-event-owner-authority-firefox, timed-event-visitor-identities-firefox, and timed-event-access-transfer-firefox
- [x] #4 No Firefox spec runs twice: the standalone single-spec postgres-plugin step is removed once the project run covers it
- [x] #5 Existing Chromium project coverage and the workflow's cache/teardown behavior are unchanged
- [x] #6 actionlint passes on the modified workflow
- [x] #7 docs/ci.md reflects the expanded Firefox CI scope
- [x] #8 The exact CI Firefox command passes locally against the Playwright-owned isolated test stack
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

Research (current system):
- `.github/workflows/e2e-ci.yml` runs Chromium projects plus one standalone Firefox step: `E2E_POSTGRES_ANONYMOUS_EVENT_CREATION_ENABLED=true nix run .#e2e -- --project=firefox-desktop specs/timed-event-postgres-plugin-firefox.spec.ts`.
- `e2e/playwright.config.ts`: `firefox-desktop` `testMatch=/timed-event-.*firefox\.spec\.ts/` (15 specs, timezone pinned to UTC); `firefox-touch` `testMatch=/schedule-overlap-mobile-touch-firefox\.spec\.ts/` (1 spec, hasTouch). The Chromium projects `testIgnore` both, so neither has CI coverage today.
- `E2E_POSTGRES_ANONYMOUS_EVENT_CREATION_ENABLED` flows from the e2e process env into `isolated-test-stack.ts` and then `POSTGRES_ANONYMOUS_EVENT_CREATION_ENABLED` for the server; `e2e/AGENTS.md` documents running the whole `firefox-desktop` project with it enabled.
- Four specs are gated on that env (`test.skip` otherwise): postgres-plugin, owner-authority, visitor-identities, access-transfer.
- `nix run .#e2e` (flake.nix) already sets `PLAYWRIGHT_BROWSERS_PATH` to `pkgs.playwright-driver.browsers`, which includes Firefox, so no provisioning change is needed.

Plan:
1. In `.github/workflows/e2e-ci.yml`, replace the "Run PostgreSQL browser lifecycle test" step with one "Run Firefox browser E2E suite" step: `E2E_POSTGRES_ANONYMOUS_EVENT_CREATION_ENABLED: "true"` plus `E2E_ARTIFACTS_DIR`, running `nix run .#e2e -- --project=firefox-desktop --project=firefox-touch`. Enabling PostgreSQL for the whole project makes the gated specs execute and folds the existing single-spec step in with no duplicate run.
2. Update the E2E CI row in `docs/ci.md` to state that it covers the Chromium projects plus the Firefox desktop and touch projects.
3. Run `actionlint` from the repo root.
4. Verify locally with the exact CI command against the Playwright-owned isolated stack on the isolated ports; if a spec fails for an unrelated pre-existing reason, record it and decide scope with the user (do not silently expand).
5. Record notes/final summary, run `graphify update .`, and finalize per the task-finalization workflow.

Risks:
- `firefox-touch` running under `E2E_POSTGRES_ANONYMOUS_EVENT_CREATION_ENABLED=true` is a new combination; if the touch spec depends on Mongo-backed anonymous creation it may need a separate non-Postgres step. Verify before finalizing.
- Full Firefox desktop suite at CI workers:1 is slow; keep the job's `timeout-minutes: 60` and confirm it fits.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-09-10 verification: ran the two exact CI commands locally with CI=true (workers:1) against the Playwright-owned isolated stack. firefox-desktop with E2E_POSTGRES_ANONYMOUS_EVENT_CREATION_ENABLED=true -> 40 passed, 1 skipped, 1 flaky, exit 0. The skipped test is a pre-existing conditional skip (`timed-event-timerange-width-firefox` sign-up row). The flaky test is `timed-event-visitor-identities-firefox.spec.ts:8` (page.waitForRequest timed out / Save button stayed disabled on attempt 1, passed on retry #1); CI's retries:2 absorbs it. firefox-touch without the PostgreSQL flag -> 7 passed, exit 0.

2026-09-10 design decision: running firefox-touch under E2E_POSTGRES_ANONYMOUS_EVENT_CREATION_ENABLED=true fails `schedule-overlap-mobile-touch-firefox.spec.ts:386` because it seeds 24 guest responses via the standalone Playwright request fixture, which has no PostgreSQL Event Visitor Creation Credential (the same class of issue documented in e2e/AGENTS.md and TASK-0189). The touch project therefore runs in the default Mongo-backed creation mode as its own step, while the desktop project runs with PostgreSQL enabled. This stays within the task scope and gives both projects CI coverage.

2026-09-10 checks: actionlint passes on the workflow. `npm run format:markdown` reflowed the `docs/ci.md` table after the E2E row grew; `format:markdown:check` and `lint:markdown` both pass. `graphify update .` run (graph rebuilt).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Run the full Firefox E2E coverage in E2E CI instead of a single spec.

- `.github/workflows/e2e-ci.yml`: replaced the "Run PostgreSQL browser lifecycle test" single-spec step with two project steps. "Run Firefox desktop browser E2E suite" runs `nix run .#e2e -- --project=firefox-desktop` with `E2E_POSTGRES_ANONYMOUS_EVENT_CREATION_ENABLED=true`, so the PostgreSQL-gated specs (postgres plugin, owner authority, visitor identities, access transfer) execute rather than skip. "Run Firefox touch browser E2E suite" runs `nix run .#e2e -- --project=firefox-touch` in the default Mongo-backed creation mode. The Chromium step and all cache/artifact/teardown steps are unchanged.
- `docs/ci.md`: the E2E CI row now states that the workflow covers the Chromium desktop and mobile projects plus the Firefox desktop and touch projects.

Why two Firefox steps: the touch spec seeds 24 guest responses through the standalone Playwright `request` fixture, which carries no PostgreSQL Event Visitor Creation Credential, so those response POSTs fail under `E2E_POSTGRES_ANONYMOUS_EVENT_CREATION_ENABLED=true`; the touch project therefore keeps the default Mongo-backed mode.

Verification (local, exact CI commands, `CI=true` so workers:1): `--project=firefox-desktop` with PostgreSQL -> 40 passed, 1 skipped (pre-existing conditional skip in `timed-event-timerange-width-firefox`), 1 flaky (`timed-event-visitor-identities-firefox` timed out on the first attempt and passed on retry #1), exit 0; `--project=firefox-touch` -> 7 passed, exit 0. `actionlint` passes; `npm run format:markdown` reformatted the widened `docs/ci.md` table and `format:markdown:check` plus `lint:markdown` pass; `graphify update .` run.

Risk: the visitor-identities Firefox spec is timing-flaky (Save button intermittently stays disabled); CI retries absorb it, but it may need a follow-up stabilization.
<!-- SECTION:FINAL_SUMMARY:END -->
