---
id: TASK-0185
title: >-
  Remove invalid :deep() selectors from NewEvent.vue non-scoped style block
  (dead rules + lightningcss build warnings)
status: Done
assignee:
  - opencode
created_date: '2026-09-08 15:12'
updated_date: '2026-09-08 15:19'
labels:
  - css
  - vuetify
  - build
dependencies: []
priority: low
type: bug
ordinal: 190000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The e2e production build (e2e/playwright.config.ts webServer runs `npm run build`) emits five `[lightningcss minify] 'deep' is not recognized as a valid pseudo-class` warnings. Vite 8 uses lightningcss as the default CSS minifier, and the warnings map exactly to the five `:deep(...)` usages inside the non-scoped `<style>` block of frontend/src/components/NewEvent.vue (block opens at line ~1122). Vue's SFC compiler only rewrites `:deep()` inside scoped style blocks, so these selectors pass through untransformed into the bundled CSS. Browsers do not recognize the `:deep()` pseudo-class either, so those five rules are currently dead (never applied) in dev and production.

Scope: rewrite the five selectors as plain descendant selectors in the non-scoped block (their target class names .new-event-dow-toggle and .compact-switch are used only inside NewEvent.vue, so plain global selectors are safe), and update the source-assertion regex in frontend/src/components/NewEvent.test.ts that references the old :deep(...) selector. This follows the existing frontend styling convention in frontend/AGENTS.md: "in non-scoped Vue style blocks, prefer plain selectors over :deep(...)". Do not silence lightningcss warnings or change the block's scoped-ness.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 No :deep(...) selectors remain in the non-scoped <style> block of frontend/src/components/NewEvent.vue; the five affected selectors use plain descendant selectors instead
- [x] #2 The affected rules (.new-event-dow-toggle button rules, .compact-switch Vuetify wrapper rules) apply in the browser in production builds; e2e production build emits no '[lightningcss minify] 'deep' is not recognized as a valid pseudo-class' warnings
- [x] #3 frontend/src/components/NewEvent.test.ts source assertions referencing the old :deep(...) selectors are updated to the corrected selectors and pass
- [x] #4 Frontend required checks pass: npm run lint, npm run fmt:check, npm run typecheck, npm run build, npm run test:unit
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
1. Edit frontend/src/components/NewEvent.vue non-scoped `<style>` block (opens line 1122): replace the five `:deep(...)` wrappers with plain descendant selectors — `.new-event-dow-toggle :deep(.v-btn)` → `.new-event-dow-toggle .v-btn`, `.new-event-dow-toggle :deep(.v-btn__overlay)` → `.new-event-dow-toggle .v-btn__overlay`, `.compact-switch :deep(.v-selection-control)` → `.compact-switch .v-selection-control`, `.compact-switch :deep(.v-label)` → `.compact-switch .v-label`, `.compact-switch :deep(.v-selection-control__wrapper)` → `.compact-switch .v-selection-control__wrapper`. Keep declarations unchanged.
2. Edit frontend/src/components/NewEvent.test.ts line ~1150 source-assertion regex from `/\.compact-switch :deep\(\.v-label\)\s*\{\s*display:\s*none;/` to the corrected plain selector form.
3. Confirm no other `:deep` usages sit in non-scoped blocks (verified: all other usages are in scoped blocks or the scoped-src shared CSS file; only NewEvent.test.ts line 1150 references the offending selector).
4. Verify: `npm run lint`, `npm run fmt:check`, `npm run typecheck`, `npm run build` (confirm zero lightningcss `:deep` warnings), `npm run test:unit` from frontend/.
5. Verify e2e: `nix run .#e2e -- --project=chromium-desktop --project=chromium-mobile` shows no `[lightningcss minify] 'deep'` warnings; visually confirm via e2e run passing (the dow-toggle and compact-switch rules now actually apply).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified no `:deep` remains in NewEvent.vue (repo grep; only the five non-scoped-block usages existed there).

newEventStyleBlock in NewEvent.test.ts extracts the plain `<style>` block via /<style>([\s\S]*)<\/style>/, so the updated regex at line ~1150 still targets the edited block.

Build check: `npm run build` output filtered for lightningcss/deep/error showed none; e2e run confirmed the same during its `npm run build && serve` webServer step.

DoD #4 (format:markdown) vacuously satisfied: no Markdown files changed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Removed the five invalid `:deep(...)` selectors from the non-scoped `<style>` block of `frontend/src/components/NewEvent.vue` (lines ~1155–1221), rewriting them as plain descendant selectors: `.new-event-dow-toggle .v-btn`, `.new-event-dow-toggle .v-btn__overlay`, `.compact-switch .v-selection-control`, `.compact-switch .v-label`, `.compact-switch .v-selection-control__wrapper`. Declarations are unchanged.

Why: Vue only rewrites `:deep()` inside scoped style blocks, so these selectors passed through untransformed into bundled CSS; browsers do not recognize the `:deep()` pseudo-class, so the five rules were dead in dev and production. Vite 8's default lightningcss CSS minifier surfaced this as five `[lightningcss minify] 'deep' is not recognized as a valid pseudo-class` warnings during the e2e production build. The fix follows the frontend AGENTS.md styling convention: "in non-scoped Vue style blocks, prefer plain selectors over :deep(...)".

Also updated the source-assertion regex in `frontend/src/components/NewEvent.test.ts` (line ~1150) that expected the old `.compact-switch :deep(.v-label)` selector to expect the corrected `.compact-switch .v-label` form. No other `:deep` usages were touched: all remaining usages live in scoped style blocks or the shared `ScheduleOverlapCompactSwitch.css` consumed via `<style scoped src>`, where `:deep()` is valid and transformed.

Verification: `npm run lint` (2 pre-existing unrelated warnings), `npm run fmt:check`, `npm run typecheck`, `npm run build` (zero lightningcss warnings), `npm run test:unit` (140 files / 1038 tests passed), and `nix run .#e2e -- --project=chromium-desktop --project=chromium-mobile` (46 passed, 20 skipped by project filters; WebServer build output contains no `[lightningcss minify]` warnings, previously 5). Risks: none identified; the two rewritten class names are used only inside NewEvent.vue, so widening from `:deep` to plain descendant selectors does not leak styles to other components.
<!-- SECTION:FINAL_SUMMARY:END -->
