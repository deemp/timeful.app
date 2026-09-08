---
id: TASK-0182
title: >-
  Fix mobile More options button squeezed to ~32px with clipped label in timed
  event toolbar (chromium-mobile e2e regression)
status: Done
assignee:
  - '@opencode'
created_date: '2026-09-08 12:45'
updated_date: '2026-09-08 12:59'
labels:
  - frontend
  - mobile-layout
  - e2e
dependencies: []
references:
  - backlog/handoffs/handoff-2026-09-08T12-39-47Z.md
  - e2e/specs/event-toolbar-mobile-layout.spec.ts
priority: high
type: bug
ordinal: 187000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Pre-existing regression on main, surfaced by the new e2e CI verification for TASK-0165: on chromium-mobile, `e2e/specs/event-toolbar-mobile-layout.spec.ts:176` ("mobile timed toolbar groups row 1 left and stacks the action rows") fails because the More options button is squeezed to ~32px width with its label clipped ("ore o") while the accessible text exists. Expected width >= 100.

Suspected cause cluster: the recent Tailwind v4 / Vuetify v4 migration commits (b0c15bd7, 82974117, b5f2530b, 8c66f9c9, dfefc63e); TASK-0173 only verified the Firefox desktop suite, so chromium-mobile was not exercised. Leading hypothesis at handoff time: the v-btn `:size="32"` (`menu-button-size="32"` in `frontend/src/components/schedule_overlap/ToolRow.vue`) may drive width in Vuetify v4; relevant component is `frontend/src/components/schedule_overlap/EventOptions.vue` (`tw:min-w-0 tw:px-3`, activator `tw:w-fit`, section `tw:w-full`), activator id `#event-options-menu-activator`.

Failure artifacts from the reproducing runs: /tmp/opencode/timeful-e2e-artifacts/2026-09-08T12-29-19.864469971Z-p1334362/ (full run) and /tmp/opencode/timeful-e2e-artifacts/2026-09-08T12-32-07.565386963Z-p1348600/ (isolated; trace.zip, video, error-context.md, test-failed-1.png). Full-run tally: 42 passed, 1 failed, 20 skipped, 3 did not run; failure reproduces in isolation (not a flake).

This bug blocks TASK-0165 AC #2 (e2e CI cannot show a passing chromium-mobile run while main is broken). Fix with a clean layout-based approach, not a hack, per frontend AGENTS.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 On a mobile viewport, the timed event toolbar's More options button renders at its intended width (>= 100px, not clipped to ~32px) and its label is fully visible instead of truncated to 'ore o'.
- [x] #2 `nix run .#e2e -- --project=chromium-mobile specs/event-toolbar-mobile-layout.spec.ts` passes, including the 'mobile timed toolbar groups row 1 left and stacks the action rows' assertion that expects the More options button width >= 100.
- [x] #3 The desktop chromium project is not regressed: `nix run .#e2e -- --project=chromium-desktop --project=chromium-mobile` passes for the previously green specs.
- [x] #4 Required frontend checks pass from frontend/: npm run lint, npm run fmt:check, npm run typecheck, npm run build, npm run test:unit.
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
Root cause (confirmed): Vuetify 4.2 `useSize` (vuetify/lib/composables/size.js:18-22) applies non-predefined `size` values as inline styles setting BOTH `width` and `height`. The More options activator receives `:size="32"` (prop `menu-button-size="32"` from ToolRow.vue), so in v4 the button is clamped to 32px wide and its label clips to "ore o". In v3 the prop did not force width, which is why this regressed with the v3->v4 migration.

Fix (height-only sizing, width stays content-sized):
1. EventOptions.vue: rename prop `menuButtonSize` -> `menuButtonHeight` and apply it as `:height` on the activator v-btn instead of `:size`. The `height` dimension prop sets inline `height: 32px` only; width keeps `tw:w-fit` + `tw:min-w-0` + `tw:px-3` content sizing. The button keeps its 32px compact height intent from 56664710 without the v4 width clamp.
2. ToolRow.vue: pass `menu-button-height="32"` instead of `menu-button-size="32"`.
3. ToolRow.test.ts: update the raw-source assertion to `menu-button-height="32"`.
4. No change to TimezoneSelector.vue: its `size="32"` sits on an `icon` v-btn where square sizing is intended and its e2e assertions pass.
5. Regression coverage: the existing e2e assertion `e2e/specs/event-toolbar-mobile-layout.spec.ts:176` (width >= 100) already covers this bug; no new spec needed.

Verification: isolated chromium-mobile run of event-toolbar-mobile-layout.spec.ts, then the full chromium-desktop + chromium-mobile run; frontend lint/fmt/typecheck/build/test:unit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause verified in vuetify 4.2.0 source: composables/size.js applies non-predefined size values as inline width AND height styles, so :size="32" clamped the labeled activator to 32px wide. Fix makes the compact sizing height-only via the height dimension prop and renames the prop to menuButtonHeight to keep the contract honest for v4 semantics.

TimezoneSelector.vue's size="32" intentionally untouched: icon v-btn, square sizing is desired there.

Verification: targeted unit tests 21 passed; full unit suite 1038 passed (140 files); lint exit 0 with 2 pre-existing warnings in NewEvent.test.ts (unrelated); fmt:check, typecheck, build pass.

E2E: isolated chromium-mobile spec 4 passed (More options test green); full chromium-desktop+chromium-mobile run 46 passed, 20 skipped, 0 failed.

Flake observed once: 'mobile timezone control keeps its fixed width' failed in one full-spec run (reset button not visible after option selection), then passed in isolation, a repeat full-spec run, and the full desktop+mobile run. Pre-existing sensitivity in TimezoneSelector option-click settling; not touched by this fix.

graphify update . run after code changes.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## Problem

On chromium-mobile, the timed event toolbar's More options button was squeezed to 32px wide with its label clipped to "ore o", failing `e2e/specs/event-toolbar-mobile-layout.spec.ts:176` (expects width >= 100). Reproducible in isolation on main.

## Root cause

Vuetify 4.2's `useSize` composable (`vuetify/lib/composables/size.js:18-22`) applies non-predefined `size` values to v-btn as inline styles setting BOTH `width` and `height`. The activator received `:size="32"` (prop `menu-button-size="32"` from ToolRow.vue), so in v4 the button was clamped to 32px wide. In v3 the prop did not force width, which is why this regressed with the v3->v4 migration and was missed by the Firefox-desktop-only verification of TASK-0173.

## Fix

Height-only sizing, width stays content-sized:

- `frontend/src/components/schedule_overlap/EventOptions.vue`: renamed prop `menuButtonSize` -> `menuButtonHeight` and applied it as `:height` on the activator v-btn instead of `:size`. Inline `height: 32px` keeps the compact height intent; width keeps `tw:w-fit` + `tw:min-w-0` + `tw:px-3` content sizing.
- `ToolRow.vue`: passes `menu-button-height="32"`.
- `ToolRow.test.ts`: updated the raw-source assertion accordingly.
- `TimezoneSelector.vue` left unchanged: its `size="32"` sits on an `icon` v-btn where square sizing is intended.

Regression coverage is the existing e2e assertion at `e2e/specs/event-toolbar-mobile-layout.spec.ts:176` (the assertion that caught this bug).

## Tests

- Targeted unit tests (ToolRow, EventOptions): 21 passed.
- Frontend required checks: lint (exit 0; 2 pre-existing warnings in NewEvent.test.ts, unrelated), fmt:check, typecheck, build, test:unit (140 files, 1038 tests) all pass.
- `nix run .#e2e -- --project=chromium-mobile specs/event-toolbar-mobile-layout.spec.ts`: 4 passed, including the previously failing More options layout test.
- `nix run .#e2e -- --project=chromium-desktop --project=chromium-mobile` (exact e2e CI command): 46 passed, 20 skipped (Firefox-only specs), 0 failed.
- Flake observation: the "mobile timezone control keeps its fixed width" test failed once (reset button never appeared after option selection) and then passed in isolation, in a repeat full-spec run, and in the full desktop+mobile run; it is in `TimezoneSelector.vue` code paths untouched by this fix.

## Risks / follow-ups

- Unblocks TASK-0165 AC #2 (chromium-mobile green on main).
- The timezone reset test's selection-settling sensitivity remains a known flake candidate worth watching.
<!-- SECTION:FINAL_SUMMARY:END -->
