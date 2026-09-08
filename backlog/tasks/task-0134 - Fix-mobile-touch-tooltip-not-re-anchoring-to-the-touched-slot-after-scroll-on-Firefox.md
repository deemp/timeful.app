---
id: TASK-0134
title: >-
  Fix mobile touch tooltip not re-anchoring to the touched slot after scroll on
  Firefox
status: To Do
assignee: []
created_date: '2026-09-02 10:23'
updated_date: '2026-09-08 08:57'
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
- [ ] #1 Identify and record why scrolling can change the mobile tooltip's anchor in Firefox, distinguishing application interaction behavior from touch-emulation or test assumptions.
- [ ] #2 A tooltip selected by touching a grid cell remains associated with that cell while scrolling; any correction to the spec's interaction assumptions is justified with browser-event evidence and preserves real touch coverage.
- [ ] #3 The tooltip retains correct placement below the top navbar when scrolled underneath it; desktop hover, mobile selection/dragging, and outside-click dismissal remain correct.
- [ ] #4 The full e2e/specs/schedule-overlap-mobile-touch-firefox.spec.ts passes on firefox-touch, including both scrolling regressions; targeted repeated runs verify the intermittent failure is resolved without fixed sleeps or weakened assertions.
- [ ] #5 All required frontend checks (lint, fmt:check, typecheck, build, test:unit) and relevant browser regression checks pass.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 All acceptance criteria are satisfied
- [ ] #2 All required unit tests pass. Documentation-only changes are exempt unless the user requests unit tests
- [ ] #3 All required e2e tests pass. Documentation-only changes are exempt unless the user requests e2e tests
- [ ] #4 Changed Markdown files are formatted with npm run format:markdown
<!-- DOD:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-09-08: User requested a separate follow-up for the tooltip blocker discovered while finalizing TASK-0171–0173; reuse this existing matching bug under BACKLOG_WORKFLOW.md. Leave To Do; implementation is not requested in this follow-up-recording step. The historical frontend/e2e path above is now e2e/specs/schedule-overlap-mobile-touch-firefox.spec.ts.

Updated diagnosis supersedes the earlier missing-scroll-listener hypothesis: scroll listeners fire and the tooltip initially follows its selected cell. Firefox then synthesizes mouseover on the cell under the resting cursor after scrolling; useTimedGridInteractions.ts reassigns selectedTooltipSlot, position and content. Its timeslotSelected guard is write-false-only in source. The prior handoff records an observed mouseover to row 17, column 0, approximately 72 ms after scrolling. Existing unit tests intentionally cover mobile hover; preserve intended hover/touch/drag semantics when deciding the correction.

Current branch full firefox-touch: 6 passed, navbar layering/position predicate failed. The same navbar spec also passed in isolation, confirming intermittency. Artifacts: /tmp/opencode/timeful-e2e-artifacts/2026-09-08T08-37-00.377579102Z-p550687/. Earlier runs and event-level diagnostics are recorded in backlog/handoffs/handoff-2026-09-08T08-24-36Z.md.

Pre-migration baseline a1420a77, with its original frontend, specs, helpers, Tailwind 3 and Vuetify 3 locked dependencies: anchoring test failed at its final geometry predicate, navbar test passed. Artifacts: /tmp/opencode/timeful-e2e-artifacts/2026-09-08T08-38-50.699105957Z-p560129/. Scratch checkout remains at /tmp/timeful-171-baseline. This independently confirms the anchoring failure predates both styling migrations.

Reproduce only on the Playwright-owned isolated test stack, from e2e/: npm run test:e2e -- --project=firefox-touch -g 'touching a timeslot|mobile grid tooltip stays below'. Context uses viewport 375x900, hasTouch true, timezoneId UTC. Do not target development databases. The handoff's /tmp/opencode/diag-tooltip-trace.mjs is historical diagnostic evidence, not the authorized E2E runner.

Migration verification is otherwise green: frontend lint/fmt/typecheck/build, 1036 unit tests, 11 Chromium styling checks (one intentional mobile-hover skip), Firefox desktop 28 passed/2 skipped. The styling/Vite fixes do not change tooltip interaction code.
<!-- SECTION:NOTES:END -->
