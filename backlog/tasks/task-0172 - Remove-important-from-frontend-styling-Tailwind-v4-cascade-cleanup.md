---
id: TASK-0172
title: Remove !important from frontend styling (Tailwind v4 cascade cleanup)
status: To Do
assignee:
  - '@opencode'
created_date: '2026-09-07 16:53'
updated_date: '2026-09-07 17:12'
labels:
  - frontend
  - tailwind
  - styling
dependencies:
  - TASK-0171
references:
  - TASK-0171
  - frontend/tailwind.config.cjs
  - frontend/src/index.css
priority: medium
type: chore
ordinal: 181300
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Remove !important from all frontend styling (zero !important in our source; Vuetify's internal ~1800 !important declarations are third-party and stay). Agreed mechanism (investigated 2026-09-07): layer Vuetify's stylesheet below Tailwind's utilities - vite plugin vuetify({ autoImport: true, styles: "none" }), `@layer theme, base, components, vuetify, utilities;` order declared before the tailwind import, and `@import 'vuetify/styles/main.css' layer(vuetify);` in index.css. Then unlayered hand-written overrides beat both layered Vuetify and layered tw: utilities without importance, utilities beat Vuetify component styles by layer order, and every hand-written !important (index.css, ~12 component files, App.vue inline style) can be dropped. Per-case audit still required where overrides collide with Vuetify's own !important helper classes (e.g. .elevation-N on default elevated v-btn vs .timeful-elevated-button). Execution is deferred until TASK-0171 lands (it owns the index.css rewrite and tailwind.config.cjs deletion this builds on). Works on branch chore/tailwind-v4.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Zero !important declarations remain in frontend/src hand-written CSS: index.css, all Vue style blocks, ScheduleOverlapCompactSwitch.css, and inline styles
- [ ] #2 No important flag anywhere in our pipeline: the tailwind config carries none and the tailwind/vuetify imports in index.css use no important param
- [ ] #3 Vuetify styles are delivered inside a cascade layer below utilities (vite plugin styles:"none" plus @import 'vuetify/styles/main.css' layer(vuetify) with @layer theme, base, components, vuetify, utilities order), so layered tw: utilities beat Vuetify component styles without importance
- [ ] #4 Unlayered override classes (timeful-elevated-button, timeful-switch, timeful-solo-field, schedule-overlap-compact-switch, timezone-select--compact-button, destructive-outlined-button, gated-feature-checkbox and peers) still render identically; collisions with Vuetify's !important helper classes are resolved via Vuetify props/slots or per-case fixes
- [ ] #5 Layered tw: utilities no longer carry !important; no appearance regression where utilities beat Vuetify styles or unlayered overrides
- [ ] #6 CSS-text unit test assertions (NewEvent.test.ts, TimezoneSelector.test.ts, Event.test.ts, RespondentsList.test.ts, GuestDialog.test.ts) assert the new selector/declaration forms
- [ ] #7 Grep gate: rg '!important' frontend/src returns no matches
- [ ] #8 All required frontend checks pass: lint, fmt:check, typecheck, build, test:unit; firefox e2e suite passes from e2e/; bundle-size delta from full-stylesheet delivery is recorded in the task
- [ ] #9 TASK-0171 remains annotated that its utilities-with-important parity decision (AC #2/#6) is superseded by this task (annotation added 2026-09-07)
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
Deferred until TASK-0171 lands (user-approved 2026-09-07). Sequence when resumed:
1. Gate: TASK-0171 done - tailwind.config.cjs deleted, index.css on CSS-first @theme imports.
2. vite.config.ts: vuetify({ autoImport: true, styles: "none" }); keep vuetify.ts JS import voided by the plugin.
3. index.css: declare `@layer theme, base, components, vuetify, utilities;` before the tailwind import and add `@import 'vuetify/styles/main.css' layer(vuetify);`; ensure no `important` param anywhere.
4. Drop every hand-written !important (index.css, ~12 component files, App.vue inline style). Unlayered overrides now win by layer order; only audit collisions with Vuetify's !important helper classes per rule (start with .timeful-elevated-button vs .elevation-N on default elevated v-btn; prefer Vuetify props/slots on collision).
5. Update CSS-text assertions in NewEvent/TimezoneSelector/Event/RespondentsList/GuestDialog tests.
6. Verify: build + dist inspection (layer order, utilities without importance, no preflight parity change, bundle-size delta note), required checks, firefox e2e, visual smoke; graphify update; finalize.
<!-- SECTION:PLAN:END -->

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
<!-- COMMENTS:END -->
