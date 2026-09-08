---
id: TASK-0134
title: >-
  Fix mobile touch tooltip not re-anchoring to the touched slot after scroll on
  Firefox
status: Done
assignee:
  - Codex
created_date: '2026-09-02 10:23'
updated_date: '2026-09-08 11:36'
labels:
  - e2e
  - frontend
dependencies: []
references:
  - TASK-0171
  - TASK-0172
  - TASK-0173
  - backlog/handoffs/handoff-2026-09-08T08-24-36Z.md
  - e2e/specs/schedule-overlap-mobile-touch-firefox.spec.ts
  - frontend/src/components/schedule_overlap/useTimedGridInteractions.ts
  - frontend/src/components/schedule_overlap/useTimedGridInteractions.test.ts
priority: medium
type: bug
ordinal: 147300
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The e2e spec frontend/e2e/schedule-overlap-mobile-touch-firefox.spec.ts:146 ("touching a timeslot keeps its mobile tooltip anchored while scrolling") fails reproducibly on the firefox-touch project: after touching a timeslot and running window.scrollBy({ top: 50 }), the expect.poll predicate that compares the tooltip's inline left/top style against the touched slot's bounding rect times out after 5s, so the tooltip no longer re-anchors to the slot while scrolling.

Evidence (2026-09-02): failed in a full npm run test:e2e run, failed again in a targeted multi-spec run, and failed in isolation on firefox-touch (5 passed, 1 failed) against the TASK-0132 worktree. It is pre-existing and independent of the Add-description spec cleanup in TASK-0132, which does not touch the tooltip path.

Diagnosis direction: the shared Tooltip component's repositioning appears not to track page scroll on touch devices. TASK-0033 ("F-TOOLTIP-001: centralize tooltip placement and visibility logic", Done) centralized tooltip placement and may be the origin of a regression; review its placement logic for scroll listeners and touch-specific position overrides. Decide after diagnosis whether the app must keep the tooltip anchored during scroll or the spec's expectation is wrong, and record that decision.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Identify and record why scrolling can change the mobile tooltip's anchor in Firefox, distinguishing application interaction behavior from touch-emulation or test assumptions.
- [x] #2 A tooltip selected by touching a grid cell remains associated with that cell while scrolling; any correction to the spec's interaction assumptions is justified with browser-event evidence and preserves real touch coverage.
- [x] #3 The tooltip retains correct placement below the top navbar when scrolled underneath it; desktop hover, mobile selection/dragging, and outside-click dismissal remain correct.
- [x] #4 The full e2e/specs/schedule-overlap-mobile-touch-firefox.spec.ts passes on firefox-touch, including both scrolling regressions; targeted repeated runs verify the intermittent failure is resolved without fixed sleeps or weakened assertions.
- [x] #5 All required frontend checks (lint, fmt:check, typecheck, build, test:unit) and relevant browser regression checks pass.
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
1. Reproduce the Firefox scrolling failure on the isolated E2E stack and inspect existing browser-event evidence.
2. Add regression coverage for mouseover after mobile selection; preserve unselected mobile hover, desktop hover, dragging and dismissal.
3. Keep explicitly selected mobile tooltips associated with their cell across scroll-generated mouseover, without changing placement rules.
4. Run both scrolling regressions repeatedly, the full mobile touch spec, relevant desktop checks and all required frontend checks; update graph and record evidence.

Executed refinement of steps 3-4: the explicit-selection flag (explicitMobileSelection) guards the phone mouseover handler; dismissals clear it. The spec's geometry predicate was made clamp-aware (replicating Tooltip.vue's 8px viewport-margin clamp with 1px boundary tolerance on left; exact top) and the previously discarded post-scroll explicit mouseover step with unchanged-content assertion was re-added, justified by geometry probes and failure-video evidence. Browser verification: firefox-touch pair x3 + full project 7/7, firefox-desktop 28 passed/2 skipped.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-09-08: User requested a separate follow-up for the tooltip blocker discovered while finalizing TASK-0171–0173; reuse this existing matching bug under BACKLOG_WORKFLOW.md. Leave To Do; implementation is not requested in this follow-up-recording step. The historical frontend/e2e path above is now e2e/specs/schedule-overlap-mobile-touch-firefox.spec.ts.

Updated diagnosis supersedes the earlier missing-scroll-listener hypothesis: scroll listeners fire and the tooltip initially follows its selected cell. Firefox then synthesizes mouseover on the cell under the resting cursor after scrolling; useTimedGridInteractions.ts reassigns selectedTooltipSlot, position and content. Its timeslotSelected guard is write-false-only in source. The prior handoff records an observed mouseover to row 17, column 0, approximately 72 ms after scrolling. Existing unit tests intentionally cover mobile hover; preserve intended hover/touch/drag semantics when deciding the correction.

Current branch full firefox-touch: 6 passed, navbar layering/position predicate failed. The same navbar spec also passed in isolation, confirming intermittency. Artifacts: /tmp/opencode/timeful-e2e-artifacts/2026-09-08T08-37-00.377579102Z-p550687/. Earlier runs and event-level diagnostics are recorded in backlog/handoffs/handoff-2026-09-08T08-24-36Z.md.

Pre-migration baseline a1420a77, with its original frontend, specs, helpers, Tailwind 3 and Vuetify 3 locked dependencies: anchoring test failed at its final geometry predicate, navbar test passed. Artifacts: /tmp/opencode/timeful-e2e-artifacts/2026-09-08T08-38-50.699105957Z-p560129/. Scratch checkout remains at /tmp/timeful-171-baseline. This independently confirms the anchoring failure predates both styling migrations.

Reproduce only on the Playwright-owned isolated test stack, from e2e/: npm run test:e2e -- --project=firefox-touch -g 'touching a timeslot|mobile grid tooltip stays below'. Context uses viewport 375x900, hasTouch true, timezoneId UTC. Do not target development databases. The handoff's /tmp/opencode/diag-tooltip-trace.mjs is historical diagnostic evidence, not the authorized E2E runner.

Migration verification is otherwise green: frontend lint/fmt/typecheck/build, 1036 unit tests, 11 Chromium styling checks (one intentional mobile-hover skip), Firefox desktop 28 passed/2 skipped. The styling/Vite fixes do not change tooltip interaction code.

2026-09-08: Paused for requested handoff before runtime changes. Added two failing unit regressions (21 passed, 2 failed). Original two scrolling E2Es passed once; strengthened anchoring E2E with explicit post-scroll mouseover and unchanged-content assertion fails before fix while retaining native touchscreen tap and geometry predicate. Artifacts: /tmp/opencode/timeful-e2e-artifacts/2026-09-08T09-04-49.912535889Z-p660934/. Plan: distinguish hover-derived mobile anchors from explicit click/drag selections, protect explicit selection from mouseover, reset on dismissal. Runtime code, formatting, required checks, graph update and repeated post-fix browser verification remain outstanding.

2026-09-08 (continuation): Implemented the runtime fix per plan. useTimedGridInteractions.ts now tracks explicitMobileSelection: set when a phone click or drag assigns selectedTooltipSlot, cleared on all three dismissal paths (outside-grid capture click, non-selectable tap, split-gap click); the phone mouseover handler returns early while an explicit selection is active. Hover-derived mobile anchors, scroll repositioning, and placement rules unchanged. The two staged unit regressions now pass: 28/28 in the composable+component suites, 1038/1038 across the frontend unit suite.

2026-09-08: Geometry diagnosis with a temporary sampling probe (spec restored afterwards; diag file removed). The remaining run-3 failure was NOT re-pointing: the tooltip was visually anchored correctly for the entire failing poll (video frames f-024..f-035), but the shared Tooltip clamps left to 8 + halfWidth. Under VITE_ENABLE_SIGN_IN=true (the committed .env.test.example default at the time) the event-page grid column intermittently renders 10px narrower: slotWidth 125.5 vs 135.5, slot center 110.75 < clamp min 112.858, so the app wrote style.left=112.858px while the exact-equality predicate demanded 110.75 - deterministic timeout despite correct anchoring. Under flags=false the slot center 115.75 clears the clamp by 2.89px. The app's written left uses watch-time width (112.858px) while live width measures 209.7166748046875 (half 104.8583374), so the hardened predicate uses a 1px tolerance on left only; top remains exact and rejects any re-pointed tooltip.

2026-09-08: Environment confound identified mid-session: the user flipped VITE_ENABLE_SIGN_IN/VITE_ENABLE_RICH_LANDING to false in local .env.test (matching a pending .env.test.example edit kept as a separate change), and landed font commits b5f2530b (self-hosted Google Fonts) and 8c66f9c9 (mono utility applies via root defaults), which stabilize the tooltip width and remove the font-load race. Per user decision the spec keeps BOTH the re-added post-scroll explicit mouseover step (with unchanged-content assertion, native tap preserved) and the clamp-aware geometry predicate. e2e package lint, fmt:check and typecheck pass.

2026-09-08: Verification under the canonical flags=false env: targeted pair runs x3 all pass (anchoring + navbar), full firefox-touch project 7/7 passed, firefox-desktop 28 passed/2 skipped (parity with the pre-change baseline). Required frontend checks re-run after the font commits: lint 0 errors (2 pre-existing vue/one-component-per-file warnings), fmt:check clean, typecheck clean, test:unit 1038/1038; build verified by the Playwright webServer pre-command on every e2e run. graphify update . completed (4865 nodes, 7953 edges). DoD #4: the only changed Markdown is the Backlog-managed task record, which is excluded from format:markdown.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Root cause (two independent layers):

1. App bug: after scrolling, Firefox synthesizes a mouseover on whichever slot sits under the resting cursor. The phone mouseover handler in useTimedGridInteractions.ts re-pointed the anchored mobile tooltip (selectedTooltipSlot, position, content) because its guard timeslotSelected is only ever written false in src. Fixed by tracking explicit click/drag selections separately from hover-derived anchors: a new explicitMobileSelection ref is set when a phone click or drag assigns the anchor, cleared on every dismissal path (outside-grid capture click, non-selectable tap, split-gap click), and the phone mouseover handler returns early while an explicit selection is active. Hover-derived anchors, scroll repositioning, and placement rules are unchanged.

2. Spec assumption bug: the anchoring test's exact-equality geometry predicate ignored the shared Tooltip's legitimate horizontal clamp (8px viewport margin, Tooltip.vue clampHorizontalPosition). Geometry probes captured during real failures showed the event-page grid column intermittently renders 10px narrower (slotWidth 125.5 vs 135.5 depending on VITE_ENABLE_SIGN_IN), putting the slot center (110.75) below the clamp minimum (112.858), so the app wrote left=112.858px while the predicate demanded the unclamped center; the tooltip was visually anchored correctly the whole time (verified via failure video frames and geometry samples).

Changes:

- frontend/src/components/schedule_overlap/useTimedGridInteractions.ts: explicit-selection tracking and mouseover guard (7 lines).
- frontend/src/components/schedule_overlap/useTimedGridInteractions.test.ts: two regressions (clicked cell and drag endpoint survive mouseover; re-anchor after dismissal) plus oxfmt formatting.
- e2e/specs/schedule-overlap-mobile-touch-firefox.spec.ts: re-added the post-scroll explicit mouseover step with an unchanged-content assertion (native touchscreen tap still performs selection), and made the geometry predicate clamp-aware: expected left is the slot center clamped exactly like the app, with 1px tolerance for the clamp boundary and subpixel measure jitter; top stays exact and still rejects any re-pointed anchor.

Tests: unit 1038/1038; firefox-touch pair runs x3 (2 passed each); full firefox-touch project 7 passed; firefox-desktop 28 passed/2 skipped (baseline parity); frontend lint (0 errors, 2 pre-existing warnings), fmt:check, typecheck, build (webServer pre-command on every e2e run), test:unit all green; e2e package lint/fmt:check/typecheck clean; graphify updated.

Notes: verification ran under the new test-env flags (VITE_ENABLE_SIGN_IN=false, VITE_ENABLE_RICH_LANDING=false) via the user's local .env.test; the matching .env.test.example flip is the user's separate change. The self-hosted-font commits b5f2530b/8c66f9c9 stabilized the measured tooltip width (209.7166748046875) and removed the font-load race that contributed to the original intermittency.
<!-- SECTION:FINAL_SUMMARY:END -->
