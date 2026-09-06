---
id: TASK-0167
title: >-
  Restyle event-page Delete buttons to outlined trash-icon buttons and drop
  pale-fill tokens
status: Done
assignee:
  - '@opencode'
created_date: '2026-09-06 16:20'
updated_date: '2026-09-06 22:53'
labels:
  - frontend
  - design-system
  - styling
dependencies:
  - TASK-0166
references:
  - frontend/src/views/Event.vue
  - frontend/src/index.css
  - >-
    backlog/completed/task-0156 -
    Soften-solid-event-page-Delete-buttons-from-bright-red-to-pale-red-fill.md
priority: medium
type: enhancement
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up to completed TASK-0156, which softened the event-page Delete buttons from solid bright red to a pale red fill. Product decision since then: the Delete button should not be a filled tonal button at all. Final design is an outlined button with a trash icon (not solid, no tint fill).

This task depends on TASK-0166 (unify all frontend reds on one canonical hue #DB1616 with role-based tokens). That task provides the canonical red token and keeps the dark destructive foreground #991b1b only as a transitional contrast measure for the pale fill; this task removes the fill and therefore the reason for the dark step.

Scope:
- Restyle both event-page Delete buttons (desktop and mobile editing actions, currently styled by the `.destructive-tonal-button` class in frontend/src/views/Event.vue) to the Vuetify outlined variant with a trash icon, using the canonical red for text, border, and icon.
- Add a low-opacity wash of the canonical red as the hover state instead of any solid fill.
- Remove the now-unused pale-fill tokens (`--timeful-destructive-btn-bg`, `--timeful-destructive-btn-fg`, `--timeful-destructive-btn-border`) and the transitional dark red foreground from frontend/src/index.css once nothing references them.
- The existing outlined red Cancel/Clear buttons on the event page (e.g. desktop cancel, clear schedule, mobile cancel) are the visual reference for the outlined destructive style, except they carry no icon.

UX rationale: an outline plus icon differentiates Delete from Cancel while dropping the tint; canonical red on white passes WCAG AA (~5.1:1), so the dark foreground step is no longer needed.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Desktop and mobile event-page Delete buttons render as outlined buttons with a trash icon in the canonical red
- [x] #2 The outlined Delete button hover state uses a low-opacity wash of the canonical red instead of a solid fill
- [x] #3 The outlined Delete button text and icon meet WCAG AA contrast on their background
- [x] #4 The pale-red-fill destructive button tokens and their dark-red foreground are removed and no longer referenced anywhere in the frontend
- [x] #5 No unit test pins the removed tokens or the previous tonal button styling
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
- Both Delete buttons live in frontend/src/views/Event.vue: desktop `#desktop-delete-availability-btn` (line ~655, variant="flat", class `destructive-tonal-button desktop-editing-delete-button desktop-event-header-control tw-normal-case`) and the mobile bottom-bar Delete (line ~929, no variant, class `destructive-tonal-button tw-text-sm tw-normal-case`).
- `.destructive-tonal-button` (Event.vue non-scoped style block, line ~2385) is the only consumer of the three `--timeful-destructive-btn-*` tokens in index.css (lines 15-21); grep confirms no other frontend references.
- Tailwind `red` already points at var(--timeful-red-canonical) (TASK-0166), so `tw-text-red`/`tw-border-red` render the canonical hue.
- Vuetify 3.12.8 facts (node_modules VBtn.css): `.v-btn--variant-outlined { border: thin solid currentColor; background: transparent }`, and `.v-btn__overlay { background-color: currentColor }` with hover opacity `calc(var(--v-hover-opacity) * multiplier)` (4% default) — so outlined + canonical-red text gives red border/icon via currentColor. Choosing an explicit hover wash instead: any explicit wash >= ~4% combined with the default 4% overlay pushes effective text contrast below 4.5:1, so the plan scopes `--v-hover-opacity: 0` to the destructive class and uses a 5% wash (matches the app's existing 5% wash convention from TASK-0166 and keeps hover AA).
- @mdi/font 7.4.47 is globally imported (main.ts), so `mdi-trash-can-outline` renders without config changes.
- Unit tests: no test pins `destructive-tonal-button` or the removed tokens (AC #5 already satisfied); Event.test.ts pins the delete button's layout classes and CSS block (lines 2671-2688) and the desktop cancel's `data-variant="outlined"` pattern; NewEvent.test.ts has a "derives every red role from one canonical hue" drift guard to extend.
- E2E: event-mobile-editing-options.spec.ts locates the mobile Delete by role/name (icon is aria-hidden, name unchanged). Playwright projects: chromium-desktop, chromium-mobile, firefox-desktop, firefox-touch. TASK-0166 deferred the shared event-page e2e run to this task.

Plan:
1. Event.vue desktop Delete: variant flat -> outlined; class `destructive-tonal-button` -> `destructive-outlined-button`; content becomes `<v-icon>mdi-trash-can-outline</v-icon><span class="tw-ml-1">Delete</span>` (icon inherits canonical red via currentColor).
2. Event.vue mobile Delete: add variant="outlined"; class -> `destructive-outlined-button`; same icon + span content.
3. Event.vue style block: replace `.destructive-tonal-button` with `.destructive-outlined-button { color: var(--timeful-red-canonical) !important; border: 1px solid var(--timeful-red-canonical) !important; --v-hover-opacity: 0; }` and `.destructive-outlined-button:hover { background-color: color-mix(in srgb, var(--timeful-red-canonical) 5%, transparent) !important; }` (explicit canonical-red border instead of relying on currentColor; drop the old bg/fg/border token styling and box-shadow rule, outlined has none).
4. index.css: remove `--timeful-destructive-btn-bg`, `--timeful-destructive-btn-fg`, `--timeful-destructive-btn-border` (the transitional dark fg #991b1b goes with them).
5. NewEvent.test.ts drift guard: extend "derives every red role from one canonical hue" to assert index.css no longer contains `--timeful-destructive-btn` or `#991b1b`.
6. Event.test.ts: extend the desktop editing test - delete button `data-variant` outlined, classes contain `destructive-outlined-button`, source pins for the new class attribute, the hover-wash CSS block, and the trash icon; extend the mobile editing test with the same assertions for the mobile Delete.
7. Checks: lint, fmt:check, typecheck, build, test:unit; then e2e for the shared event-page surface (event-mobile-editing-options on chromium-mobile, timed-event-create-firefox on firefox-desktop, plus event-page layout specs touching the header if applicable) - covering TASK-0166's deferred shared-surface run.
8. Run `graphify update .`; verify ACs with evidence; record final summary and complete the task.

Contrast math (AC #3): #db1616 on white 5.07:1 (AA); on 5% canonical-red wash over white (effective ~#fdf3f3) ~4.67:1 (AA); icon is non-text (3:1 threshold) - passes in all states.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Hover design decision: Vuetify's native outlined hover overlay is currentColor at 4% (--v-hover-opacity), which would already be a red wash, but combining it with any explicit wash >= ~4% pushes effective text contrast below 4.5:1 (e.g. 5% + 4% => ~8.8% => ~4.44:1). Chose an explicit 5% canonical-red wash (matching the app's 5% wash convention) and scoped `--v-hover-opacity: 0` on `.destructive-outlined-button` so the hover state is fully ours, deterministic, and AA-clean (4.67:1).

Explicit border kept on the class rather than relying on Vuetify's `border: thin solid currentColor` for the outlined variant - same rendered result, deterministic against framework changes; `box-shadow: none` dropped since outlined buttons have no shadow.

Temporary browser-verification spec learnings: (1) Vuetify `.v-btn` has a 0.15s all-property transition, so computed hover styles must be polled to settle before asserting (a sample at t~8ms read alpha 0.0004 of the 0.05 target); (2) Chromium serializes settled `color-mix(in srgb, var(--timeful-red-canonical) 5%, transparent)` as color(srgb 0.858824 0.0862745 0.0862745 / 0.05) but mid-transition interpolations as oklab - compare against a reference probe element instead of hardcoded strings.

Verification approach: besides unit tests and e2e, ran a temporary (untracked, deleted afterward) Playwright spec asserting rendered rest and hover styles in chromium-mobile, because hover styling could not be pinned by the repo's static unit assertions alone.

E2E for the shared event-page surface was run in this task as deferred by TASK-0166: event-mobile-editing-options (chromium-mobile) 2/2, timed-event-create-firefox (firefox-desktop) 6/6, days-only editing layout (chromium-desktop) 1/1 - all pass; no tooltip-anchoring flakes encountered.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Restyled both event-page Delete buttons from pale-red tonal fill to outlined trash-icon buttons and removed the now-obsolete pale-fill tokens, completing the design reversal started by TASK-0156/0166.

Changes:
- frontend/src/views/Event.vue: desktop `#desktop-delete-availability-btn` and the mobile bottom-bar Delete now use `variant="outlined"` with a `mdi-trash-can-outline` icon plus "Delete" label. The shared `.destructive-tonal-button` class was replaced by `.destructive-outlined-button`, which sets text and border to `var(--timeful-red-canonical)` (icon inherits via currentColor) and scopes `--v-hover-opacity: 0` to neutralize Vuetify's framework hover overlay. A `:hover` rule adds the hover state as `color-mix(in srgb, var(--timeful-red-canonical) 5%, transparent)` — a low-opacity canonical-red wash instead of any solid fill; 5% matches the app's existing wash convention from TASK-0166.
- frontend/src/index.css: removed `--timeful-destructive-btn-bg`, `--timeful-destructive-btn-fg` (the transitional dark #991b1b), and `--timeful-destructive-btn-border`. Nothing references them anymore.
- frontend/src/components/NewEvent.test.ts: the "derives every red role from one canonical hue" drift guard now also asserts index.css no longer contains `--timeful-destructive-btn` or `#991b1b`, preventing reintroduction.
- frontend/src/views/Event.test.ts: desktop editing-test assertions extended (delete button `data-variant` outlined, `destructive-outlined-button` class, trash icon in text, source pins for the new class attribute and the hover-wash CSS block); new dedicated test "renders the mobile editing delete button as an outlined trash-icon button" covers the mobile button.

Verification:
- Checks: lint (0 errors, 2 pre-existing unrelated warnings), fmt:check, typecheck, build, and the full unit suite (140 files, 1036 tests) pass. Compiled dist CSS confirmed to contain the new `.destructive-outlined-button` rules and no `--timeful-destructive-btn` tokens.
- Browser-level scripted check (temporary Playwright spec, run against the isolated test stack and removed afterward): rest state renders `v-btn--variant-outlined` with 1px solid rgb(219, 22, 22) border, rgb(219, 22, 22) text/icon, fully transparent background, visible mdi-trash-can-outline icon, accessible name "Delete" unchanged; on hover the computed background-color exactly equals the reference `color-mix(in srgb, var(--timeful-red-canonical) 5%, transparent)` (color(srgb 0.858824 0.0862745 0.0862745 / 0.05)) and the Vuetify `.v-btn__overlay` opacity is 0.
- E2E (also covering the shared event-page e2e run deferred from TASK-0166): event-mobile-editing-options (chromium-mobile) 2/2, timed-event-create-firefox (firefox-desktop) 6/6, event-page-days-only-layout "days-only event editing with responses" (chromium-desktop) 1/1 — all pass.
- Contrast: canonical red #db1616 on white 5.07:1 (AA); on the 5% hover wash (effective ~#fdf3f3) 4.67:1 (AA); icon is non-text (3:1 threshold) — passes in all states, so the dark foreground step is no longer needed.

Notes: Vuetify `.v-btn` transitions all properties for 0.15s, so hover styling fades in briefly; the scripted check polls computed styles until the transition settles before asserting.
<!-- SECTION:FINAL_SUMMARY:END -->
