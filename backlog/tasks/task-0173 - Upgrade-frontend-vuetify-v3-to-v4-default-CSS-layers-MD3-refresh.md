---
id: TASK-0173
title: 'Upgrade frontend vuetify v3 to v4 (default CSS layers, MD3 refresh)'
status: Done
assignee:
  - Codex
created_date: '2026-09-07 17:33'
updated_date: '2026-09-08 11:57'
labels:
  - frontend
  - vuetify
  - upgrade
dependencies:
  - TASK-0171
references:
  - 'https://vuetifyjs.com/en/features/css-utilities/tailwindcss/'
  - 'https://vuetifyjs.com/en/features/css-utilities/overview/'
  - frontend/src/plugins/vuetify.ts
  - frontend/vite.config.ts
  - TASK-0134
documentation:
  - 'https://vuetifyjs.com/en/getting-started/upgrade-guide/'
  - 'https://vuetifyjs.com/en/styles/layers/'
priority: medium
type: chore
ordinal: 180800
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Upgrade the frontend from vuetify 3.12.8 to vuetify ^4.2.0 to unlock default cascade layers (introduced opt-in in 3.6.0, default in v4) and the MD3 refresh. This is the prerequisite for TASK-0172's !important removal (Vuetify's official TailwindCSS integration assumes layered vuetify styles) and keeps the frontend on the current vuetify major.

Verified against the vuetify 4.2.0 npm tarball (2026-09-07): compiled lib/styles/main.css is 296K with exactly 30 !important declarations, all deliberate utility/a11y semantics (.hidden-print-only and responsive d-*-none display helpers, .pointer-events-none/.pointer-events-auto/.pointer-pass-through, .d-sr-only/.d-sr-only-focusable) plus one transition rule; .elevation-* and spacing/color helpers no longer carry !important; styles are organized as @layer vuetify-core (reset) > vuetify-components > vuetify-overrides > vuetify-utilities (nested theme-base/typography/helpers/theme-background/theme-foreground) > vuetify-final (transitions, forced-colors). vite-plugin-vuetify 2.1.3 declares peer vuetify >=3; installed stack is vite 8.0.16, vue 3.5.38, vue-router 5.3.0.

Codebase impact audit (src, 2026-09-07): zero v-row/v-col usages (grid refactor irrelevant), zero elevation-* classes, zero vuetify MD2 typography classes in vue files, zero rgba(var(--v-theme-*)) usages, zero fill-height v-containers, zero multi-line snackbars; defaultTheme "light" and custom display.thresholds (sm 640, md 768, lg 1024, xl 1280) are already explicit. Real deltas to handle: (1) v4 mostly removes the global CSS reset and about 16 vue files render h1-h6/p/ul (NotSignedIn, AccessDenied, CalendarAccounts, SignInDialog, TimefulImportDialog, CookieSettings, SignInNotSupportedDialog, When2meetImportDialog, CookieConsent, StudentProofDialog, and more) - either restore the documented reset snippet inside @layer vuetify-core.reset or audit each file; (2) VBtn text-transform uppercase default removed - restore via sass $button-text-transform or defaults VBtn class, or accept and fix labels; (3) v-select-family #item="{ item }" slots: item is now an alias for internalItem.raw - rename to internalItem at the 6 call sites (ConfirmDetailsDialog.vue, TimezoneSelector.vue, NewEvent.vue, EmailInput.vue, TimeRangePicker.vue); (4) dev-only Vite 8 overlay z-index useStack issue - add the documented optimizeDeps.include list and clear node_modules/.vite; (5) MD3 typography/elevation defaults barely apply to this codebase but the few test-level CSS assertions should be re-verified.

Decisions (user-approved 2026-09-07): tracked as a separate upgrade task ahead of TASK-0172; execution deferred until TASK-0171 lands (0171 owns the Tailwind v4 worktree baseline and keeps its utilities-carry-!important parity, which stays correct on v3 and v4 alike until 0172 removes it). Scope boundary: the TailwindCSS layer-order integration itself is owned by TASK-0172; this task only delivers layered vuetify v4 with visual parity.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 frontend/package.json declares vuetify ^4.2.0 and the app boots and builds on vite 8 with vite-plugin-vuetify 2.1.3; the documented optimizeDeps.include overlay fix is applied and the node_modules/.vite cache reset is performed
- [x] #2 CSS reset and VBtn deltas are handled with recorded decisions: reset restoration scoped by an audit of all vue files rendering h1-h6/p/ul (restore snippet in @layer vuetify-core.reset or per-file audit), and the removed uppercase default restored globally (sass $button-text-transform or defaults) or accepted with label fixes
- [x] #3 The 6 v-select-family #item="{ item }" slots are renamed to internalItem; breakpoints verified (explicit display.thresholds kept, sass $grid-breakpoints aligned only if needed); defaultTheme stays light; VSnackbar/VForm/VDatePicker and other touched components verified unaffected
- [x] #4 Visual parity is verified: dist CSS inspection (five vuetify layers emitted; only the ~30 documented helper/a11y !important declarations remain), local dev flow smoke (sign in, /home, create event), and the firefox e2e suite passes from e2e/
- [x] #5 All required frontend checks pass: lint, fmt:check, typecheck, build, test:unit
- [x] #6 The bundle-size delta from the style-delivery shape change (v3 stylesheet entry vs v4 main.css) is measured from dist output and recorded in the task
- [x] #7 Tailwind delivery is untouched by this upgrade: 0171's important:true tw: utilities and index.css behavior are unchanged on vuetify v4, verified by build inspection
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
Review follow-up authorized by user: restore the removed reset behavior in vuetify-core.reset, migrate the shared button size/icon selector, and add browser coverage for margins, native button borders, and normal/icon/toggle sizing. Run required frontend checks and relevant isolated browser suites.

Resume from handoff-2026-09-08T08-24-36Z.md: reproduce the remaining Firefox touch tooltip failure, compare against the pre-migration styling baseline, and determine whether correction belongs to migration parity or needs separately approved scope; then rerun Firefox suites and finalize all three tasks in dependency order.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review follow-up: corrected the shared selector to .v-btn--size-default with .v-btn--icon excluded; restored native text/list margins and native form-control borders/backgrounds in vuetify-core.reset. During E2E, Vite 8.0.16 repeatedly generated an undefined init_runtime_dom_esm_bundler call inside the @vuetify/v0 prebundle even after cache reset. Excluding that ESM dependency from optimization resolves the startup crash; overlay includes now match Vuetify's official migration guide. All four new styling browser checks pass on desktop and mobile; broader validation is in progress.

2026-09-08: Resumed with DatePicker, timed-event helper, and optimizeDeps fixes staged; no new runtime change yet. Desktop cold-cache validation is recorded in the handoff; touch tooltip failure remains unresolved.

Baseline comparison at a1420a77 (before both styling migrations), using its untouched frontend/spec/helpers and locked Tailwind 3/Vuetify 3 dependencies on the isolated test stack: tooltip anchoring fails at the same final geometry predicate; navbar test passes in this run. Artifacts: /tmp/opencode/timeful-e2e-artifacts/2026-09-08T08-38-50.699105957Z-p560129/. Current full touch run: 6 passed, navbar failed; artifacts /tmp/opencode/timeful-e2e-artifacts/2026-09-08T08-37-00.377579102Z-p550687/. Asked user whether to include the existing interaction bug in 0173 or track separately; no tooltip code changed pending that scope decision.

Completion audit: App.vue already disabled button text transformation in the v3 baseline and still does so with an unlayered .v-btn rule; therefore v4's removed uppercase default causes no label change. All six item slots now explicitly alias the v4 raw item as internalItem and consume its raw fields; explicit theme/display thresholds remain. Reset and normal/icon dimensions pass rendered desktop/mobile checks. Fresh final production measurement: index CSS 631695 B, total CSS including the 146 B public layer-order stylesheet 723518 B, down 47799 B / 41339 B from the recorded v3 baseline. The original AC #7 important-utility wording is superseded by the combined authorized TASK-0172 layer/importance cleanup, as already recorded for TASK-0171; Tailwind changes remain owned by 0171/0172.

Graph refresh completed with no final topology changes; graphify reports four generated JSON inputs produce zero nodes (tasks.json twice, timezones.json, swagger.json). Firefox touch is not green and the task remains In Progress pending the requested existing-bug scope decision.

Final current-state Firefox desktop verification: 28 passed, 2 intentional skips (4.8m), log /tmp/timeful-171-firefox-desktop.log. All authorized styling fixes and their checks are complete; task remains In Progress because Firefox touch still has the pre-existing tooltip scrolling failure. The user scope question (include its fix in 0173 versus a separate task) remains unanswered. No commit created.

2026-09-08 user decision: keep the existing Firefox touch tooltip failure in a separate follow-up. TASK-0134 already covers the exact bug and now contains the current diagnosis, baseline comparison, artifacts and regression criteria. This supersedes the pending scope-approval question; tooltip implementation is not part of these migration changes. The failed touch acceptance evidence remains recorded; no failing check is marked as passing.

Finalization verification on HEAD dfefc63e (2026-09-08): required frontend checks all pass (lint 0 errors with 2 pre-existing warnings, fmt:check, typecheck, build, 1038 unit tests). AC #4 visual parity evidence: fresh dist inspection emits all five Vuetify layers (vuetify-core, vuetify-components, vuetify-overrides, vuetify-utilities, vuetify-final) plus tailwind-theme and tailwind-utilities in canonical order, with exactly 31 !important declarations all third-party (30 Vuetify main stylesheet helpers + forced-colors VHighlight); local dev-flow smoke was recorded during the styling-browser-check runs (margins, native button borders, normal/icon sizing pass rendered desktop and mobile); Firefox desktop e2e from e2e/ on current HEAD: 28 passed, 2 intentional skips (4.8m). AC #7: the original important-utility wording is superseded by the combined authorized TASK-0172 layer/importance cleanup, as recorded for TASK-0171; Tailwind delivery is verified unchanged on Vuetify v4 by the same dist inspection. Bundle delta re-confirmed from current build (631695 B index / 723518 B total vs v3 baseline 679494 B / 764857 B). Post-note commits b5f2530b (font self-hosting), 8c66f9c9 (root font defaults), 5f541696 (env flags) and dfefc63e (tooltip fix) landed after the earlier run; today's e2e rerun covers them. DoD #4 vacuously satisfied: no hand-written Markdown changed (backlog files are MCP-managed).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Upgraded the frontend from Vuetify 3.12.8 to Vuetify ^4.2.0 with default cascade layers and the MD3 refresh, on Vite 8 with vite-plugin-vuetify. package.json declares vuetify ^4.2.0; vite.config.ts uses vuetify({ autoImport: true }) with the documented optimizeDeps changes (including excluding the @vuetify/v0 prebundle that caused Vite 8 runtime crashes; overlay includes match the official migration guide). Breaking-change deltas were handled with recorded decisions: the removed global CSS reset was restored as native text/list margins and native form-control borders/backgrounds inside vuetify-core.reset, scoped by an audit of all vue files rendering h1-h6/p/ul; the removed VBtn uppercase default required no label fixes because App.vue already disabled text transformation in the v3 baseline via an unlayered .v-btn rule; the shared button size/icon selector was migrated to .v-btn--size-default with .v-btn--icon excluded; all 6 v-select-family #item slots were renamed to internalItem consuming the v4 raw item (ConfirmDetailsDialog, TimezoneSelector, NewEvent, EmailInput, TimeRangePicker); explicit theme (light) and display thresholds were kept. Browser coverage was added for restored reset margins, native button borders, and normal/icon/toggle sizing, passing on desktop and mobile. AC #7's original important-utility wording is superseded by the authorized TASK-0172 cascade cleanup (recorded in notes and in TASK-0171); Tailwind delivery is verified intact on Vuetify v4 via dist inspection (tailwind-theme/tailwind-utilities layers and --tw-color-* vars emitted alongside all five Vuetify layers). Bundle-size delta measured from fresh production output: index CSS 631695 B, total CSS including the 146 B public layer-order stylesheet 723518 B, down 47799 B / 41339 B from the recorded v3 baseline. Verification on HEAD dfefc63e: lint (0 errors, 2 pre-existing warnings), fmt:check, typecheck, build, and 1038 unit tests pass; dist shows exactly 31 !important declarations, all third-party (30 Vuetify main-stylesheet helpers + forced-colors VHighlight); Firefox desktop e2e: 28 passed, 2 intentional skips (4.8m). Graph refresh completed; graphify reports four generated JSON inputs producing zero nodes. The pre-existing Firefox touch tooltip interaction is out of scope and tracked in TASK-0134 (fix dfefc63e landed separately).
<!-- SECTION:FINAL_SUMMARY:END -->
