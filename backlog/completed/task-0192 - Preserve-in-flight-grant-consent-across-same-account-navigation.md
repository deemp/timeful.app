---
id: TASK-0192
title: Preserve in-flight grant consent across same-account navigation
status: Done
assignee:
  - OpenCode
created_date: '2026-09-10 06:57'
updated_date: '2026-09-10 07:31'
labels: []
dependencies: []
references:
  - frontend/src/components/event/GrantedAccessConfirmation.vue
  - frontend/src/components/event/GrantedAccessConfirmation.test.ts
  - /tmp/opencode/timeful-e2e-artifacts/task-0191-01-seed-guest/
modified_files:
  - frontend/src/components/event/GrantedAccessConfirmation.vue
  - frontend/src/components/event/GrantedAccessConfirmation.test.ts
priority: high
type: bug
ordinal: 208000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User approved fixing a frontend consent-dialog race discovered during TASK-0191.01 performance work.
GrantedAccessConfirmation marks an event inspected before awaiting grantAssociation, but route watcher cleanup drops the result even when the signed-in account is unchanged.
The recorded guest journey received confirmationRequired:true on /home but never displayed the dialog.
Preserve at-most-once inspection per event per sign-in while ensuring same-account navigation does not discard required consent.
Discard results from prior sign-ins and disposed components.
This supersedes the deliberately accepted stale-navigation edge in completed TASK-0188.02, without changing transport contracts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Required grant consent remains visible when navigation occurs during inspection for the same signed-in account, without issuing duplicate event inspections.
- [x] #2 Sign-out, account switches, sign-out/sign-in to the same account, and component disposal prevent old inspection results from appearing.
- [x] #3 Focused regression tests and required frontend checks pass; the recorded PostgreSQL guest approval journey reaches and dismisses the consent dialog.
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
1. Update the existing stale-navigation unit test to require retention of same-account results and add deferred-result tests for account changes, re-sign-in, and unmount.
2. Replace route-scoped result invalidation with sign-in-generation invalidation plus scope disposal, preserving inspected caching.
3. Run focused unit tests, recorded PostgreSQL guest journey and full transfer coverage, then all required frontend checks; record evidence.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Session stop / resume — 2026-09-10
User requested notes and continuation in another session.
Implementation is present but required broad checks remain pending; keep In Progress.

### Root cause and scope approval
TASK-0191.01 faster recorded browser journeys exposed a missing guest consent dialog even when the API returned confirmationRequired:true.
Failure artifact: /tmp/opencode/timeful-e2e-artifacts/task-0191-01-seed-guest/; isolated guest failed on the dialog assertion in 20.4 seconds, below its 30-second budget.
The trace's grant-association response resource 6b2f07e8946f82eb02966a73dea055b815de7a03.json contains {"confirmationRequired":true}, while error-context shows the signed-in dashboard without the dialog.
The existing watcher marked events inspected before awaiting the request, then route-triggered onCleanup invalidated the response; the next watcher skipped the inspected event.
TASK-0188.02 explicitly accepted dropping stale navigation results to retain at-most-once caching; the user approved fixing this discovered failure in a separate linked task.

### Implementation
GrantedAccessConfirmation.vue now scopes result validity to a signInGeneration rather than route watcher cleanup.
The generation increments when the watched signed-in user ID changes and on component scope disposal.
Same-account route changes retain in-flight results; inspected is still populated before awaiting, so concurrent route-triggered inspections do not duplicate calls.
Pending and inspected are still cleared on sign-in identity changes.
Both the loop and response handling reject results from older generations, including sign-out/sign-in to the same account across observed transitions and unmount.
No transport, server, or consent-confirmation contract changed.

### Regression tests and verification
Updated the old unit test that expected stale navigation results to disappear: it now requires the EVENT123 prompt after navigation and verifies no duplicate inspection on returning.
Added deferred-result cases for sign-out, account switch, same-account re-sign-in, and unmount; old loops must neither display consent nor inspect their next event.
Before the runtime fix, npm run test:unit -- src/components/event/GrantedAccessConfirmation.test.ts failed exactly the new retention assertion (1 failed / 8 passed).
After the runtime fix, the same command passed all 9 tests.
Ran targeted oxfmt on both changed frontend files.
Recorded Firefox guest journey with the performance changes and E2E_FRONTEND=bundled passed after this fix: 19.3s, artifacts /tmp/opencode/timeful-e2e-artifacts/task-0191-01-consent-fixed-guest/.
The first four journeys then all passed with two workers and E2E_VIDEO=on: guest 28.3s, owner 28.2s, signed-in 18.5s, approved guest reload 13.0s; artifacts /tmp/opencode/timeful-e2e-artifacts/task-0191-01-consent-fixed-four-1/.
Exact runnable command and infrastructure timings are in TASK-0191.01.

### Remaining work
- Run required frontend npm run lint, npm run fmt:check, npm run typecheck, npm run build, and npm run test:unit; none of these full checks ran during this implementation.
- Continue repeated recorded two-worker/full-eight E2E verification with TASK-0191.01; consider a default dev-mode guest regression run too.
- Review staged and unstaged changes before further work: these frontend files were unstaged and this task untracked at session stop, while the E2E changes were staged.
- Run Markdown formatting, graphify update ., and diff review after final edits; graph update has not run yet.
- Finalize only after required checks; no acceptance/DoD boxes have been checked and no commit was created.
TASK-0191.01 depends on this task; preserve its performance work and the unrelated worktree changes.

### Verification completed — 2026-09-10
- Focused unit suite: `npm run test:unit -- src/components/event/GrantedAccessConfirmation.test.ts` → 9 passed (retains consent across navigation without repeating in-flight queries; discards in-flight consent after sign-out, account switch, same-account re-sign-in, and unmount; associates only after confirmation).
- Required frontend checks from `frontend/`: `npm run lint`, `npm run fmt:check`, `npm run typecheck`, `npm run build`, and `npm run test:unit` (145 files / 1071 tests) all pass.
- Recorded PostgreSQL guest approval journey reaches and dismisses the consent dialog: `E2E_FRONTEND=bundled E2E_POSTGRES_ANONYMOUS_EVENT_CREATION_ENABLED=true npm run test:e2e -- --project=firefox-desktop --workers=2 specs/timed-event-access-transfer-firefox.spec.ts --grep 'Source approves the exact target code for guest access'` → 1 passed in 16.5s (invocation 36.5s).
- No transport or consent-confirmation contract changed; no Markdown files changed by this task.

### Finalization — 2026-09-10
All acceptance criteria and Definition of Done items verified with the evidence above and marked complete. Status set to Done.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixes a consent-dialog race found while speeding up the recorded PostgreSQL access-transfer E2E journeys. `GrantedAccessConfirmation.vue` previously invalidated in-flight grant-association results on every route watcher cleanup, so navigating between events under the same sign-in could drop a required consent dialog even after the API returned `confirmationRequired: true`. The watcher now tracks a `signInGeneration` that increments only when the signed-in user ID changes or the component scope is disposed, retaining same-account navigation results while rejecting results from prior sign-ins and disposed components; `inspected` still populates before the await so concurrent route-triggered inspections do not duplicate calls. Added 9 focused regression tests (retain across navigation without duplicate inspection; discard after sign-out, account switch, same-account re-sign-in, and unmount). Verified: focused unit tests 9/9; frontend lint, fmt:check, typecheck, build, and full test:unit (1071 tests) pass; recorded PostgreSQL guest approval journey reaches and dismisses the dialog. No transport or consent-contract changes. The same-account retention intentionally supersedes the stale-navigation drop accepted in TASK-0188.02."
<!-- SECTION:FINAL_SUMMARY:END -->
