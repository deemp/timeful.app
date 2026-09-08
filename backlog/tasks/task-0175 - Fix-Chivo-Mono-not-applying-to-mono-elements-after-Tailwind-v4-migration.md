---
id: TASK-0175
title: Fix Chivo Mono not applying to mono elements after Tailwind v4 migration
status: Done
assignee: []
created_date: '2026-09-08 10:54'
updated_date: '2026-09-08 11:04'
labels:
  - frontend
  - styling
dependencies: []
priority: medium
type: bug
ordinal: 183300
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
During TASK-0174 verification, schedule grid time labels render in DM Sans instead of Chivo Mono.

Root cause (verified live at the dev origin with a computed-style probe): App.vue's global style block has an unlayered universal rule `* { font-family: "DM Sans", sans-serif; }`. Unlayered author declarations outrank every cascade layer for normal declarations, so it beats the layered `.tw\:font-mono` utility (which emits `font-family: var(--tw-font-mono)` with "Chivo Mono" first). Under Tailwind v3 this worked only because the removed tailwind.config.cjs set `important: true`, making utilities `!important`.

The v3-era universal rule is the wrong tool now: it fights all layered font utilities. Replace it with root-level defaults that can only act through inheritance: set `--v-font-body: "DM Sans", sans-serif` on `:root` (covers all 49+ Vuetify typography usages of `var(--v-font-body, "Roboto", ...)`; `--v-font-heading` falls back to it) and set `html { font-family: "DM Sans", sans-serif }` for plain text. Direct declarations on elements (utilities, Vuetify classes) always beat inherited values regardless of layering.

Scope: App.vue global style block, index.css root defaults, e2e regression coverage. No other font-family rules change.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 App.vue global styles no longer set font-family via a universal selector; the DM Sans default lives in index.css root-level rules (--v-font-body and html font-family) so it cannot outrank layered utilities
- [x] #2 Vuetify typography consumers of --v-font-body/--v-font-heading resolve to DM Sans and plain text still inherits DM Sans (no serif fallback)
- [x] #3 Grid time labels and other tw:font-mono elements compute font-family "Chivo Mono" in the browser, covered by a new e2e regression spec on a seeded timed event page
- [x] #4 Required frontend checks pass (lint, fmt:check, typecheck, build, test:unit) and the targeted e2e project passes
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 All acceptance criteria are satisfied
- [x] #2 All required unit tests pass. Documentation-only changes are exempt unless the user requests unit tests
- [x] #3 All required e2e tests pass. Documentation-only changes are exempt unless the user requests e2e tests
- [ ] #4 Changed Markdown files are formatted with npm run format:markdown
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add e2e regression spec first (e2e/specs): seed a canonical timed event, open the event page, assert a `tw:font-mono` grid time label computes a Chivo Mono font-family. Run it on chromium-desktop to confirm it fails against the current code.
2. Fix: remove `* { font-family: "DM Sans", sans-serif; }` from App.vue's global style block; add `--v-font-body: "DM Sans", sans-serif` to index.css `:root` (Vuetify typography vars resolve through it) and `html { font-family: "DM Sans", sans-serif; }` for plain-text inheritance.
3. Re-run the targeted e2e spec (expect pass), then frontend required checks (lint, fmt:check, typecheck, build, test:unit).
4. Record final summary and mark Done; update graphify.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed the regression where grid time labels (and every other tw:font-mono element) rendered in DM Sans instead of Chivo Mono after the Tailwind v4 migration.

Root cause: App.vue's global style block carried a v3-era unlayered universal rule `* { font-family: "DM Sans", sans-serif; }`. Unlayered author declarations outrank every cascade layer for normal declarations, so it beat the layered `.tw\:font-mono` utility (`font-family: var(--tw-font-mono)` with "Chivo Mono" first). It had worked under Tailwind v3 only because the removed tailwind.config.cjs set `important: true`. The @fontsource self-hosting from TASK-0174 and the removed tailwind.config.cjs were both fine — the v4 CSS-first `@theme --font-mono` token and the generated `.tw\:font-mono` utility were verified correct in dev and dist output.

Changes:
- frontend/src/App.vue: removed the universal `* { font-family: "DM Sans", sans-serif; }` rule (and its commented touch-action line) from the global style block.
- frontend/src/index.css: added root-level font defaults that act only through inheritance — `:root { --v-font-body: "DM Sans", sans-serif }` (covers all Vuetify typography consumers of var(--v-font-body, ...); --v-font-heading falls back to it) and `html { font-family: "DM Sans", sans-serif }` for plain text. Direct declarations (utilities, Vuetify classes) always beat inherited values regardless of layering.
- e2e/specs/schedule-overlap-mono-labels.spec.ts: new regression spec — seeds a canonical timed event (specific_dates, 09:00-17:00 UTC window), opens the event page, and asserts every rendered [class*='font-mono'] element (gutter labels + collapsed-hour buttons) computes a Chivo Mono font-family while the body still computes DM Sans (guards against a serif fallback and Vuetify Roboto regression). Avoids anchoring to a row id because collapsed hours and viewer timezone shift which rows render per project.

Evidence:
- Regression spec failed against the pre-fix code with mono elements computing "DM Sans", sans-serif (the bug), and passes after the fix: chromium-desktop 1 passed.
- e2e styling-migration.spec.ts (production cascade order + !important cleanup) still passes on chromium-desktop.
- Live Firefox dev origin (4173) computed-style probe now resolves tw:font-mono to "Chivo Mono", ui-monospace, ... (was "DM Sans", sans-serif before the fix).
- dist build contains no universal font-family rule; :root defines --v-font-body: "DM Sans", sans-serif and html carries the DM Sans default; Vuetify's layered html rule resolves through the same variable.
- Required frontend checks pass: lint (0 errors; 2 pre-existing warnings), fmt:check, typecheck, build, test:unit (1038 passed).

Note: e2e lint currently fails on untracked pre-existing diagnostics file specs/zz-diag-tooltip.spec.ts (consistent-type-imports, prefer-optional-chain); unrelated to this task and present before the change. The firefox-desktop project ignores this non-firefox spec, so browser coverage is chromium-desktop plus the live Firefox probe.
<!-- SECTION:FINAL_SUMMARY:END -->
