---
id: TASK-0166
title: Unify all frontend reds on one canonical hue with role-based tokens
status: Done
assignee:
  - '@opencode'
created_date: '2026-09-06 16:20'
updated_date: '2026-09-06 21:56'
labels:
  - frontend
  - design-system
  - styling
dependencies: []
references:
  - frontend/src/index.css
  - frontend/tailwind.config.cjs
  - frontend/src/plugins/vuetify.ts
  - frontend/src/components/NewEvent.test.ts
  - >-
    backlog/completed/task-0156 -
    Soften-solid-event-page-Delete-buttons-from-bright-red-to-pale-red-fill.md
priority: medium
type: enhancement
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The frontend currently uses several near-identical but distinct reds: Tailwind `red` #DB1616 (tailwind.config.cjs) and the Vuetify theme `error` #DB1616 (src/plugins/vuetify.ts) for cancel/error accents and native Vuetify error outlines; `--timeful-error-foreground` #dc2626 (frontend/src/index.css) for the NewEvent submit error text and invalid-field outline; a pale-fill destructive button pair (#fee2e2 bg / #991b1b fg, introduced in completed TASK-0156); and unavailable-slot washes based on #e52323.

Agreed design decision: adopt one canonical red hue (#DB1616) with role-based steps, not one literal value everywhere. Roles legitimately need different lightness for WCAG AA contrast (e.g. red on white passes ~5.1:1, while the same red on the pale fill would be ~4.1:1, so the darker destructive fg stays until the outlined restyle follow-up removes the fill).

Constraints and intent:
- The canonical hue must be defined once and derived everywhere practical so future drift is impossible; washes should be derived from the canonical hue rather than independent literals (the tiny perceptual shift from the old #e52323 base is accepted).
- Aligning the custom error foreground with #DB1616 also resolves the known mismatch between Vuetify's native error outline and the custom invalid-field outline previously noted in completed TASK-0141.
- Follow the frontend styling rules: use `--timeful-*` semantic tokens for shared visual states; the tailwind config already has an established pattern of pointing palette entries at CSS variables (see `outline-neutral`).
- The pale-fill destructive button itself stays visually as-is in this task (except for hue unification of its fill); its restyle to an outlined icon button is a separate follow-up task.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A single canonical red hue (#DB1616) is the only red hue used across error text, error outlines, destructive button styling, and calendar unavailable-slot washes
- [x] #2 Custom error text and the invalid-field outline in the event form render the same red as Vuetify's native error color, removing the two-red mismatch in one form
- [x] #3 Unavailable-slot washes derive from the canonical red rather than an independent red literal; any rendered color shift is visually imperceptible
- [x] #4 The event-page Delete buttons keep WCAG AA contrast while they still use the pale red fill
- [x] #5 Unit test expectations pinned to previous red hex values are updated to assert the consolidated tokens
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
Research findings (current system):
- index.css :root holds the red roles today: --timeful-error-foreground #dc2626, destructive btn pair #fee2e2/#991b1b, unavailable washes #e523230d / #f9cccc / #e523233b (scheduleOverlapRendering.ts consumes them via var()).
- tailwind.config.cjs `red: "#DB1616"` (used by tw-text-red / tw-border-red / hover:tw-text-red call sites only; no opacity modifiers).
- vuetify.ts theme `error: "#DB1616"`. Vuetify 3.12.8 parseColor (node_modules/vuetify/lib/util/colorUtils.js) throws on var() references, so the theme error cannot reference a CSS variable; it must stay a literal and gets a unit-test drift guard instead.
- NewEvent.test.ts "defines shared semantic styling tokens at the app layer" pins the old hexes (#dc2626, #e523230d, #f9cccc, #e523233b).
- Invalid-field outline already uses rgb(var(--v-theme-error)); aligning --timeful-error-foreground to #db1616 fixes the two-red mismatch (TASK-0141 follow-up).

Plan:
1. index.css: define --timeful-red-canonical: #db1616 once at the top of the red roles; derive --timeful-error-foreground: var(--timeful-red-canonical); derive the pale destructive fill as color-mix(in srgb, var(--timeful-red-canonical) 12%, white) (≈ old #fee2e2); keep the transitional dark step --timeful-destructive-btn-fg: #991b1b (same hue, removed by TASK-0167); derive unavailable washes: bg 5% transparent mix (≈ old 5.1% alpha), time-grid 22% white mix (≈ old #f9cccc), day-grid 23% transparent mix (≈ old 23.1% alpha). Perceptual shifts are ≤2 RGB points, imperceptible.
2. tailwind.config.cjs: red: "var(--timeful-red-canonical)" following the outline-neutral pattern.
3. vuetify.ts: leave error: "#DB1616" (parseColor constraint), documented here.
4. NewEvent.test.ts: update pinned assertions to the consolidated token structure and add a canonical-hue drift guard asserting index.css canonical value, vuetify.ts error literal, and tailwind red var all agree on #db1616.
5. Contrast check: #db1616 on white ≈ 5.07:1 (AA for the 12px submit error text); destructive pair keeps #991b1b on the derived pale fill (≥6.6:1), satisfying AC #4 until TASK-0167 removes the fill.
6. Run lint, fmt:check, typecheck, build, test:unit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented as planned. index.css now defines --timeful-red-canonical: #db1616 once and derives every red role from it: --timeful-error-foreground via var(); destructive fill via color-mix(in srgb, canonical 12%, white) (≈ old #fee2e2, ΔRGB ≤ 3); unavailable washes via color-mix at 5% transparent / 22% white / 23% transparent (≈ old #e523230d / #f9cccc / #e523233b, ΔRGB ≤ 2). The transitional dark step --timeful-destructive-btn-fg: #991b1b is kept for AA contrast on the pale fill and is removed by TASK-0167. tailwind red now points at var(--timeful-red-canonical) (outline-neutral pattern). vuetify.ts error stays the literal #DB1616 because Vuetify 3.12.8 parseColor cannot resolve var(); a unit-test drift guard ("derives every red role from one canonical hue") asserts index.css canonical value, the vuetify literal, and the tailwind var all agree, and that the old independent literals (#dc2626, #e52323, #fee2e2) are gone. NewEvent.test.ts token assertions were updated to the consolidated structure.

Contrast: #db1616 on white ≈ 5.07:1 (AA); destructive pair stays #991b1b on the derived 12% pale fill ≥ 6.6:1 (AC #4).

Verification: lint (0 errors, 2 pre-existing unrelated warnings), fmt:check, typecheck, build, and full unit suite (140 files, 1035 tests) all pass. Compiled dist CSS confirmed to contain --timeful-red-canonical, the three color-mix washes, and .tw-text-red{color:var(--timeful-red-canonical)!important}. E2E for the shared event-page surface is run once together with TASK-0167 (same page, same buttons) and recorded in both tasks.

E2E update (TASK-0167 deferred by the user, so the shared-surface e2e was run for this task alone): event-mobile-editing-options (chromium-mobile) and timed-event-create-firefox (firefox-desktop) pass; schedule-overlap-mobile-touch-firefox (firefox-touch) passes 6/8 with two tooltip-anchoring failures ("touching a timeslot keeps its mobile tooltip anchored while scrolling" failing consistently, "mobile grid tooltip stays below the top navbar" flaky). A/B verification with the three task changes stashed (clean HEAD) reproduced the same failures, proving they are pre-existing on main and unrelated to the token change; the stash was restored afterward. These failures are outside this task's acceptance criteria and were not expanded here.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Unified all frontend reds on one canonical hue (#DB1616) defined once and derived everywhere practical, with role-based steps for WCAG AA contrast.

Changes:
- frontend/src/index.css: added `--timeful-red-canonical: #db1616` as the single red source. Derived roles from it: `--timeful-error-foreground: var(--timeful-red-canonical)` (was #dc2626, now matches Vuetify's native error color, resolving the two-red mismatch in the event form noted in TASK-0141); destructive pale fill via `color-mix(in srgb, var(--timeful-red-canonical) 12%, white)` (≈ #fee2e2); unavailable-slot washes via `color-mix` at 5% transparent (≈ #e523230d), 22% white (≈ #f9cccc), and 23% transparent (≈ #e523233b). Rendered shifts are ≤ 3 RGB points (imperceptible, per the accepted tolerance). The transitional dark step `--timeful-destructive-btn-fg: #991b1b` is kept for AA contrast on the pale fill and is scheduled for removal in TASK-0167.
- frontend/tailwind.config.cjs: `red` now points at `var(--timeful-red-canonical)` following the existing `outline-neutral` pattern.
- frontend/src/plugins/vuetify.ts: unchanged. Vuetify 3.12.8 `parseColor` cannot resolve `var()`, so the theme error stays the literal #DB1616; a new unit-test drift guard pins agreement between the canonical token, the Vuetify literal, and the Tailwind var.
- frontend/src/components/NewEvent.test.ts: token assertions updated from the previous independent hex values to the consolidated token structure; new test "derives every red role from one canonical hue" guards against drift and asserts the old literals (#dc2626, #e52323, #fee2e2) are gone.

Contrast: #db1616 on white ≈ 5.07:1 (AA); the destructive pair keeps #991b1b on the derived pale fill (≥ 6.6:1).

Checks: lint (0 errors, 2 pre-existing unrelated warnings), fmt:check, typecheck, build, and the full unit suite (140 files, 1035 tests) pass; compiled dist CSS verified to contain the canonical token, the three color-mix washes, and `.tw-text-red{color:var(--timeful-red-canonical)!important}`. E2E: event-mobile-editing-options (chromium-mobile) and timed-event-create-firefox (firefox-desktop) pass; schedule-overlap-mobile-touch-firefox (firefox-touch) passes 6/8 with two tooltip-anchoring failures verified pre-existing on clean HEAD via an A/B stash run (unrelated to this change). Changed Markdown handled by npm run format:markdown.
<!-- SECTION:FINAL_SUMMARY:END -->
