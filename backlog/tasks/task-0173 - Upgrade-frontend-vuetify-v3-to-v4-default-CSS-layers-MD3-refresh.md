---
id: TASK-0173
title: 'Upgrade frontend vuetify v3 to v4 (default CSS layers, MD3 refresh)'
status: In Progress
assignee:
  - Codex
created_date: '2026-09-07 17:33'
updated_date: '2026-09-07 20:44'
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
- [ ] #1 frontend/package.json declares vuetify ^4.2.0 and the app boots and builds on vite 8 with vite-plugin-vuetify 2.1.3; the documented optimizeDeps.include overlay fix is applied and the node_modules/.vite cache reset is performed
- [ ] #2 CSS reset and VBtn deltas are handled with recorded decisions: reset restoration scoped by an audit of all vue files rendering h1-h6/p/ul (restore snippet in @layer vuetify-core.reset or per-file audit), and the removed uppercase default restored globally (sass $button-text-transform or defaults) or accepted with label fixes
- [ ] #3 The 6 v-select-family #item="{ item }" slots are renamed to internalItem; breakpoints verified (explicit display.thresholds kept, sass $grid-breakpoints aligned only if needed); defaultTheme stays light; VSnackbar/VForm/VDatePicker and other touched components verified unaffected
- [ ] #4 Visual parity is verified: dist CSS inspection (five vuetify layers emitted; only the ~30 documented helper/a11y !important declarations remain), local dev flow smoke (sign in, /home, create event), and the firefox e2e suite passes from e2e/
- [ ] #5 All required frontend checks pass: lint, fmt:check, typecheck, build, test:unit
- [ ] #6 The bundle-size delta from the style-delivery shape change (v3 stylesheet entry vs v4 main.css) is measured from dist output and recorded in the task
- [ ] #7 Tailwind delivery is untouched by this upgrade: 0171's important:true tw: utilities and index.css behavior are unchanged on vuetify v4, verified by build inspection
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 All acceptance criteria are satisfied
- [ ] #2 All required unit tests pass. Documentation-only changes are exempt unless the user requests unit tests
- [ ] #3 All required e2e tests pass. Documentation-only changes are exempt unless the user requests e2e tests
- [ ] #4 Changed Markdown files are formatted with npm run format:markdown
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Review follow-up authorized by user: restore the removed reset behavior in vuetify-core.reset, migrate the shared button size/icon selector, and add browser coverage for margins, native button borders, and normal/icon/toggle sizing. Run required frontend checks and relevant isolated browser suites.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review follow-up: corrected the shared selector to .v-btn--size-default with .v-btn--icon excluded; restored native text/list margins and native form-control borders/backgrounds in vuetify-core.reset. During E2E, Vite 8.0.16 repeatedly generated an undefined init_runtime_dom_esm_bundler call inside the @vuetify/v0 prebundle even after cache reset. Excluding that ESM dependency from optimization resolves the startup crash; overlay includes now match Vuetify's official migration guide. All four new styling browser checks pass on desktop and mobile; broader validation is in progress.
<!-- SECTION:NOTES:END -->
