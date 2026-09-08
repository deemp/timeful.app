---
id: TASK-0172
title: Remove !important from frontend styling (Tailwind v4 cascade cleanup)
status: Done
assignee:
  - Codex
created_date: '2026-09-07 16:53'
updated_date: '2026-09-08 11:58'
labels:
  - frontend
  - tailwind
  - styling
dependencies:
  - TASK-0171
  - TASK-0173
references:
  - TASK-0171
  - frontend/tailwind.config.cjs
  - frontend/src/index.css
  - TASK-0134
priority: medium
type: chore
ordinal: 181300
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Remove !important from all frontend styling (zero !important in our source; vuetify's remaining third-party !important declarations stay). Mechanism (re-decided 2026-09-07 after the vuetify v4 investigation): after TASK-0173 delivers vuetify v4 with default cascade layers, integrate Tailwind per Vuetify's official TailwindCSS guide instead of the v3 styles:"none" hack - a layers file declaring `@layer tailwind-theme, tailwind-reset, vuetify-core, vuetify-components, vuetify-overrides, vuetify-utilities, tailwind-utilities, vuetify-final;` loaded before `import 'vuetify/styles'`, and index.css importing `tailwindcss/theme` into layer(tailwind-theme) and `tailwindcss/utilities` into layer(tailwind-utilities) with prefix(tw), `@custom-variant dark/light` wired to `.v-theme--dark`/`.v-theme--light`, breakpoint `@theme` alignment with vuetify's display.thresholds, and no preflight. Then unlayered hand-written overrides beat both layered vuetify and layered tw: utilities, tw: utilities beat vuetify component styles by layer order, and every hand-written !important (index.css, ~12 component files, App.vue inline style) can be dropped.

vuetify 4.2.0's compiled main.css carries exactly 30 !important declarations (.hidden-print-only, responsive d-*-none display helpers, .pointer-events-*, .d-sr-only* in vuetify-utilities.helpers, plus one transition rule in vuetify-final); .elevation-* no longer carries !important, so the former per-case elevation audit (.timeful-elevated-button vs .elevation-N) is gone. Collisions with those 30 helpers remain theoretically possible but our overrides target none of those classes; a spot check during execution is enough.

Execution is deferred until TASK-0171 and TASK-0173 land (0171 owns the index.css rewrite and tailwind.config.cjs deletion this builds on; 0173 owns the vuetify v4 upgrade with default layers). Works on branch chore/tailwind-v4.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Zero !important declarations remain in frontend/src hand-written CSS: index.css, all Vue style blocks, ScheduleOverlapCompactSwitch.css, and inline styles
- [x] #2 No important flag anywhere in our pipeline: the tailwind config carries none and the tailwind/vuetify imports in index.css use no important param
- [x] #3 Vuetify v4 styles are delivered in the default cascade layers (vuetify-core, vuetify-components, vuetify-overrides, vuetify-utilities, vuetify-final) with the official Tailwind layer-order declaration loaded before vuetify/styles, and tw: theme/utilities are imported into tailwind layers with no important param, so layered tw: utilities beat vuetify component styles without importance
- [x] #4 Unlayered override classes (timeful-elevated-button, timeful-switch, timeful-solo-field, schedule-overlap-compact-switch, timezone-select--compact-button, destructive-outlined-button, gated-feature-checkbox and peers) still render identically; the remaining ~30 third-party !important declarations in vuetify 4.2.0 are verified not to collide with our overrides
- [x] #5 Layered tw: utilities no longer carry !important; no appearance regression where utilities beat Vuetify styles or unlayered overrides
- [x] #6 CSS-text unit test assertions (NewEvent.test.ts, TimezoneSelector.test.ts, Event.test.ts, RespondentsList.test.ts, GuestDialog.test.ts) assert the new selector/declaration forms
- [x] #7 Grep gate: rg '!important' frontend/src returns no matches
- [x] #8 All required frontend checks pass: lint, fmt:check, typecheck, build, test:unit; firefox e2e suite passes from e2e/; bundle-size delta from full-stylesheet delivery is recorded in the task
- [x] #9 TASK-0171 remains annotated that its utilities-with-important parity decision (AC #2/#6) is superseded by this task (annotation added 2026-09-07)
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
Deferred until TASK-0171 and TASK-0173 land (user-approved 2026-09-07). Sequence when resumed:
1. Gate: TASK-0171 done (tailwind.config.cjs deleted, index.css CSS-first) and TASK-0173 done (vuetify ^4.2.0 with default layers and breaking-change fixes).
2. Add the layer-order file in the official Tailwind guide order (tailwind-theme, tailwind-reset, vuetify-core, vuetify-components, vuetify-overrides, vuetify-utilities, tailwind-utilities, vuetify-final) and import it before vuetify/styles (src/plugins/vuetify.ts).
3. index.css: import tailwindcss/theme into layer(tailwind-theme) and tailwindcss/utilities into layer(tailwind-utilities) with prefix(tw); add @custom-variant dark/light wired to .v-theme--dark/.v-theme--light; align @theme breakpoints with vuetify display.thresholds; keep @source globs; ensure no important param anywhere.
4. Drop every hand-written !important (index.css, ~12 component files, App.vue inline style); unlayered overrides win by cascade; spot-check overrides against the ~30 remaining third-party !important helpers.
5. Update CSS-text assertions in NewEvent/TimezoneSelector/Event/RespondentsList/GuestDialog tests.
6. Verify: build + dist inspection (layer order, utilities without importance, bundle-size delta note), required checks, firefox e2e, visual smoke; graphify update; finalize.

Review follow-up authorized by user: load the layer-order declaration before every stylesheet, add rendered cascade regression coverage, and verify production CSS plus required checks. The combined staged 0171–0173 implementation supplies the dependencies for this fix.

Completion audit found two remaining acceptance failures: a trailing-important respondent opacity utility and no global layer-order declaration anywhere in fresh production output. Preserve respondent email-hover behavior without importance; make the canonical layer declaration load before styles in both dev and production; add rendered regression coverage and inspect rebuilt artifacts.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-09-08 fresh build: index CSS 631729 B, total CSS 723406 B, 32 !important declarations in the index chunk, including one app-generated opacity utility. The declared src/styles/layers.css order is absent from all dist CSS/JS/HTML, despite main.ts importing it first. These are TASK-0172 AC #3/#5 failures; source rg '!important' alone misses the trailing ! utility modifier.

2026-09-08 corrections verified: canonical layer declaration moved to frontend/public/styles/layers.css and linked first in frontend/index.html; the JS import was removed because production bundling dropped the declaration. New browser regression serves actual production artifacts through the isolated origin; it failed before the correction and passes after it on Chromium desktop/mobile. Playwright now builds once before its Vite server starts, making the production check self-contained.

Removed the remaining trailing ! from the respondent email-hover opacity utility; its existing :has selector is sufficiently specific. Browser hover probe demonstrates actions visible over the respondent name, hidden over email, then visible over name again; no extra CSS override needed. Styling suite: 11 passed, 1 intentional mobile-hover skip. Production index CSS now 631695 B; all CSS including the 146 B public layer stylesheet totals 723518 B. Compared with v3 (679494 B index / 764857 B total), savings are 47799 B index and 41339 B total. Main CSS has 31 third-party importance declarations (30 in Vuetify main stylesheet plus forced-colors VHighlight); no generated tw: utility contains importance, and source rg '!important' returns no matches.

Frontend lint (two existing warnings), formatting, typecheck, build and 1036 unit tests pass. E2E lint/typecheck pass; formatting found and corrected pre-existing staged helper formatting. Markdown formatter passes. Firefox desktop rerun underway; Firefox touch remains blocked by the existing tooltip interaction pending scope approval.

Final current-state Firefox desktop verification: 28 passed, 2 intentional skips (4.8m), log /tmp/timeful-171-firefox-desktop.log. All authorized styling fixes and their checks are complete; task remains In Progress because Firefox touch still has the pre-existing tooltip scrolling failure. The user scope question (include its fix in 0173 versus a separate task) remains unanswered. No commit created.

2026-09-08 user decision: keep the existing Firefox touch tooltip failure in a separate follow-up. TASK-0134 already covers the exact bug and now contains the current diagnosis, baseline comparison, artifacts and regression criteria. This supersedes the pending scope-approval question; tooltip implementation is not part of these migration changes. The failed touch acceptance evidence remains recorded; no failing check is marked as passing.

Finalization verification on HEAD dfefc63e (2026-09-08): grep gate re-run clean - rg '!important' frontend/src returns no matches, and no important: param in vite.config.ts or index.css. Required frontend checks all pass (lint 0 errors with 2 pre-existing warnings, fmt:check, typecheck, build, 1038 unit tests). AC #4 evidence: rendered styling browser checks recorded (11 passed, 1 intentional mobile-hover skip) covering the unlayered override classes; production CSS carries exactly 31 third-party !important declarations (30 Vuetify main-stylesheet helpers + forced-colors VHighlight), none targeting classes our overrides use. AC #5 evidence: fresh dist inspection shows zero app-generated or utility importance - all 31 declarations are third-party. AC #8 evidence: same-day required checks pass and Firefox desktop e2e from e2e/ on current HEAD passes (28 passed, 2 intentional skips, 4.8m); bundle-size delta recorded: index CSS 631695 B, total 723518 B including the 146 B public layer stylesheet, vs v3 baseline 679494 B / 764857 B (savings 47799 B / 41339 B). Post-note commits b5f2530b, 8c66f9c9, 5f541696 and dfefc63e landed after the earlier run; today's rerun covers them. DoD #4 vacuously satisfied: no hand-written Markdown changed (backlog files are MCP-managed).
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-09-07 17:11
---
Deferral decision (user-approved 2026-09-07): full removal is feasible via the Vuetify cascade-layer approach but should not run mid-migration; execution waits for TASK-0171 to land (its index.css rewrite and tailwind.config.cjs deletion are prerequisites). The trial removal of important:true from tailwind.config.cjs was reverted by the user; the worktree stays on the committed upgrade baseline.
---

created: 2026-09-07 17:11
---
Investigation findings 2026-09-07 (tailwindcss 4.3.3, vuetify 3.12.8, vite-plugin-vuetify): (1) v4 @config honors important:true - confirmed in installed engine lib.mjs (`if(!e.important&&c.important===!0)(e.important=!0)`), so every generated tw: utility compiles with !important (~657 unique utility strings in src). (2) Hand-written !important inventory: index.css 37, TimezoneSelector.vue 39, ScheduleOverlapCompactSwitch.css 26, Event.vue 21, NewEvent.vue 15, ExpandableSection.vue 12, App.vue 12 (incl. one inline style at App.vue:122), SignInGoogleBtn.vue 5, Landing.vue 2, Footer.vue 2, RespondentsList.vue 1, NewSignUp.vue 1; CSS-text assertions in NewEvent/TimezoneSelector/Event/RespondentsList/GuestDialog tests. (3) vuetify/lib/styles/main.css carries ~1800 !important declarations - its entire helper set (.d-*, .ma-*, .pa-*, .text-*, .bg-*, .elevation-*, flex/grid/typography) - so zero-!important can only ever mean zero in our source. (4) Removing important:true alone regresses utilities-vs-Vuetify: v4 emits utilities in @layer utilities and unlayered Vuetify styles beat all layered normal declarations; hundreds of tw: usages on Vuetify components (colors, padding, shadows) currently win only via importance. (5) Clean fix = layer Vuetify below utilities: vite plugin vuetify({ autoImport: true, styles: "none" }) plus @import 'vuetify/styles/main.css' layer(vuetify) in index.css with explicit order `@layer theme, base, components, vuetify, utilities;` declared before the tailwind import. Feasibility verified: tailwind's own @import resolver inside index.css bypasses the vite-plugin-vuetify resolveId void-interception that styles:"none" applies to the JS import (vuetify.ts:1 `import "vuetify/styles"`), and the vuetify exports map resolves vuetify/styles/main.css to lib/styles/main.css (336KB compiled css in 3.12.8). (6) Under that order: unlayered app overrides beat both layered Vuetify and layered utilities (most !important drops need no selector changes); utilities beat Vuetify component styles by layer order; Vuetify internal !important helpers still beat layered utilities (same winner as today) but would beat unlayered normal overrides on collision - per-case audit needed, starting with v-btn default elevated variant vs .elevation-N !important shadow vs .timeful-elevated-button (needs dist/DOM verification). (7) Trade-offs: style delivery becomes one full 336KB stylesheet instead of tree-shaken per-component css; vite config change overlaps TASK-0171's remaining plan; test CSS assertions need updating regardless.
---

author: opencode
created: 2026-09-07 17:34
---
Re-scope after the vuetify v4 investigation (2026-09-07): vuetify 4.2.0 makes cascade layers default and drops its compiled stylesheet from ~1800 to exactly 30 !important declarations (all deliberate helper/a11y semantics: .hidden-print-only, responsive d-*-none display helpers, .pointer-events-*, .d-sr-only*, one transition rule); .elevation-* is no longer !important, dissolving the former AC #4 elevation collision audit (.timeful-elevated-button vs .elevation-N). Vuetify now documents an official TailwindCSS v4 integration (layer-order file loaded before import 'vuetify/styles'; tailwind theme/utilities imported into tailwind layers; no styles:"none" hack needed). User-approved decisions: the vuetify v4 upgrade is tracked separately as TASK-0173 (dependency added, ordered after TASK-0171), this task is re-scoped to the official layer-order integration, and execution stays deferred until 0171 and 0173 land. Full upgrade findings and codebase audit recorded in TASK-0173's description.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Removed !important from all frontend styling while preserving rendering, using the Vuetify v4 cascade-layer integration: zero !important declarations remain in our source (index.css, all Vue style blocks, ScheduleOverlapCompactSwitch.css, inline styles) and no important flag exists anywhere in the pipeline (no important param in the Tailwind imports, no trailing ! utility modifiers - the last trailing-! respondent opacity utility was removed; its existing :has selector is sufficiently specific, verified by a rendered hover probe showing actions visible over the name and hidden over the email). Styles are delivered via the official Vuetify TailwindCSS guide order: the canonical layer declaration lives in frontend/public/styles/layers.css and is linked first in index.html (the earlier JS-imported declaration was dropped because production bundling omitted it; a new browser regression serving actual production artifacts through the isolated origin failed before the correction and passes after, on Chromium desktop and mobile). index.css imports tailwindcss/theme into layer(tailwind-theme) and tailwindcss/utilities into layer(tailwind-utilities) with prefix(tw), so unlayered hand-written overrides beat layered Vuetify and layered utilities by cascade, and tw: utilities beat Vuetify component styles by layer order with no importance. Remaining importance is exactly 31 third-party declarations in production CSS (30 Vuetify main-stylesheet helper/a11y rules + forced-colors VHighlight), verified non-colliding with our overrides. The five CSS-text assertion suites were updated to the new selector/declaration forms. Bundle impact measured from production output: index CSS 631695 B, total CSS including the 146 B public layer stylesheet 723518 B, savings of 47799 B / 41339 B versus the v3 baseline (679494 B / 764857 B). Verification on HEAD dfefc63e: lint (0 errors, 2 pre-existing warnings), fmt:check, typecheck, build, and 1038 unit tests pass; rendered styling suite 11 passed with 1 intentional mobile-hover skip; Firefox desktop e2e 28 passed, 2 intentional skips (4.8m); grep gate rg '!important' frontend/src returns no matches. The pre-existing Firefox touch tooltip interaction is out of scope and tracked in TASK-0134.
<!-- SECTION:FINAL_SUMMARY:END -->
