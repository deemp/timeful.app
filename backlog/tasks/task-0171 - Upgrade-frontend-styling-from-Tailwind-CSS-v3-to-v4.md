---
id: TASK-0171
title: >-
  Upgrade frontend styling from Tailwind CSS v3 to v4 (keep tw prefix,
  appearance parity)
status: Done
assignee:
  - Codex
created_date: '2026-09-07 14:26'
updated_date: '2026-09-08 11:57'
labels:
  - frontend
  - tailwind
  - upgrade
dependencies: []
references:
  - 'https://github.com/meetwhen/timeful/pull/19'
  - 'https://tailwindcss.com/docs/upgrade-guide'
  - >-
    https://github.com/tailwindlabs/tailwindcss.com/blob/main/src/docs/upgrade-guide.mdx
  - TASK-0134
modified_files:
  - frontend/package.json
  - frontend/package-lock.json
  - frontend/vite.config.ts
  - frontend/src/index.css
  - frontend/tailwind.config.cjs
  - frontend/postcss.config.cjs
  - frontend/src/components/NewEvent.test.ts
  - frontend/src/components/schedule_overlap/RespondentsList.vue
  - e2e/specs
priority: high
type: chore
ordinal: 180300
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Adopt Tailwind CSS v4 (dependabot PR meetwhen/timeful#19 bumps tailwindcss 3.4.19 to 4.3.3) while preserving the rendered app appearance exactly and avoiding style collisions. Vuetify stays the primary framework; utilities must keep beating Vuetify styles where they did under v3 `important: true`; unlayered overrides in index.css must keep winning; preflight stays absent so Vuetify's reset is untouched.

Verified probe results (tailwindcss 4.3.3, compile-API probe, 2026-09-07):

- CSS-first global important exists: `@import 'tailwindcss' source(none) prefix(tw) important;` emits all utilities with `!important`, reproducing v3 `important: true` with no JS config file. Probe output: `.tw\:hover\:bg-green:hover { background-color: var(--tw-color-green) !important; }`.
- v3 prefix syntax is dead in v4: candidates `tw-bg-green`, `hover:tw-bg-green`, `lg:tw:hover:...` generate nothing. Only prefix-first variant syntax works: `tw:bg-green`, `tw:hover:bg-green`, `tw:md:hidden`. Every class reference must be rewritten: 4060 `tw-` occurrences across 133 frontend/src files, plus unit-test class assertions, 6 escaped selectors in index.css, and ~32 occurrences in 10 e2e specs.
- With `prefix(tw)`, @theme vars emit namespaced as `--tw-color-*`; no collision with app `--timeful-*` tokens, Vuetify `--v-*`, or Tailwind internal `--tw-*` runtime vars (src verified to contain zero `--tw-` usage).
- `dark:` variant usage and `avail-green` palette usages verified; vue style blocks contain no `tw-` selectors; arbitrary values are all standard bracket syntax; exactly one leading-`!` important (`!tw-opacity-0`).

Decisions (user-approved 2026-09-07):

- Keep the `tw` prefix and rewrite all candidates to v4 syntax; never unprefixed utilities (collision avoidance with Vuetify/global classes was the explicit requirement).
- Adopt v4 native hover semantics (`@media (hover: hover)`); accepted behavior delta: no sticky hover on pure touch devices, desktop and hybrid unchanged. No `@custom-variant hover` override.
- The user ran the official `npx @tailwindcss/upgrade` tool on 2026-09-07 (supersedes the earlier hand-written-codemod-only decision). Its output is the uncommitted worktree baseline on chore/tailwind-v4; remaining work verifies and finishes what the tool left behind (v4 renames, escaped dot-selectors in tests, CSS-first index.css, the @tailwindcss/vite swap, e2e specs) with the same grep gates and git-diff review.
- Collision avoidance in theme: `--color-*: initial` reset so v4 default palette colors cannot leak where v3 had none; explicit full screens list; unused `avail-green`/emerald palette dropped (0 usages); `transparent`/`current` kept.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 frontend/package.json declares tailwindcss ^4.3.3 + @tailwindcss/vite, vite.config.ts registers the plugin, and postcss.config.cjs, tailwind.config.cjs and the autoprefixer/postcss devDeps are removed; vite build and dev server work with v4
- [x] #2 Built CSS preserves v3 global behavior: utilities carry !important, preflight is absent, only tw:-prefixed classes generate (no unprefixed utilities), and explicit @source globs scan only index.html, public/**/*.html and src (source(none) prevents repo-root scanning of docs/backlog)
- [x] #3 Theme is fully CSS-first in index.css @theme with no JS config: --color-*: initial reset, full v3 palette (transparent/current kept, red -> var(--timeful-red-canonical), outline-neutral -> var(--timeful-outline-neutral), unused avail-green dropped), explicit screens (sm/md/mdlg/lg/xl/2xl/publift-s/m/l/xl), --text-xs 0.813rem/1rem, --font-mono Chivo Mono stack
- [x] #4 All candidates use v4 syntax: prefix-first (tw:flex, tw:hover:bg-green, tw:md:hidden, variant order preserved), trailing important (tw:opacity-0!), renamed utilities mapped (tw:rounded-sm, tw:rounded-xs, tw:shadow-xs, tw:drop-shadow-sm), index.css override selectors use escaped colons (.tw\:bg-white), and the NewEvent.test.ts red-token assertion reads @theme in index.css; grep gates find zero remaining v3-syntax candidates in frontend/src and e2e
- [x] #5 Behavior deltas handled explicitly: v4 native hover recorded as accepted (no sticky hover on touch devices), the 6 space-x/space-y call sites audited against the v4 child-selector change, ring-2/ring-offset-2 verified to generate in v4.3.3, no other renamed/removed utility remains
- [x] #6 Appearance parity verified: dist CSS inspection (utilities with !important, no preflight, --tw-color-* theme vars), unlayered index.css overrides still win over layered utilities, visual smoke check via local dev flow plus firefox e2e suite passes
- [x] #7 All required frontend checks pass: lint, fmt:check, typecheck, build, test:unit
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
1. Preserve the already-migrated class-string baseline and complete its remaining Tailwind v4 work without a blanket codemod.
2. Replace the interim CSS import/config with CSS-first, source-limited, no-preflight Tailwind imports and the migrated v3 theme; register the Vite plugin and remove legacy Tailwind/PostCSS config.
3. Correct remaining v4 class names and escaped CSS selectors in frontend and e2e, updating tests that inspect classes or the former JS config.
4. Build and inspect generated CSS, audit the six space utilities, then run the required frontend and Firefox e2e checks.
5. Finalize TASK-0171 before moving to TASK-0173 (Vuetify v4), then TASK-0172 (layer ordering and removal of hand-written !important).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-09-07: User ran `npx @tailwindcss/upgrade` on chore/tailwind-v4. Audit of the tool output (worktree, uncommitted, mostly staged): package.json now has tailwindcss ^4.3.3 + @tailwindcss/postcss with autoprefixer removed (tool chose the PostCSS route; vite.config.ts untouched, tailwind.config.cjs kept via `@config`); index.css is a bare `@import 'tailwindcss' prefix(tw);` + `@config '../tailwind.config.cjs';` + a tool-added `@layer base` border-color compat block; all ~135 src files' class strings and class-string test assertions were rewritten to prefix-first v4 syntax and `!tw-opacity-0` became trailing-`!`. NOT done by the tool: v4 renames (zero -xs utilities; bare tw:rounded ~19 uses in vue, tw:rounded-sm 1, tw:shadow-sm 1, tw:drop-shadow 3), dot-selector escaping in tests (find(".tw:fixed") unescaped-invalid, some find() selectors still dash-form: RespondentsList.test.ts 13, ScheduleOverlap.mobileTooltip.test.ts 7, SignUpBlocksList.test.ts 4, ScheduleOverlapSidebar.test.ts 2, App/ColorLegend/NewEvent 1 each), ~29 remaining dash-form hits across ~20 vue files needing an audit, 6 dash-form override selectors in index.css, e2e specs untouched (33 dash-form occurrences in 10 files), NewEvent.test.ts still reads tailwind.config.cjs. Plan rewritten accordingly; task decision bullet updated from 'official tool is not used' to 'tool ran, output is the baseline'.

Implemented the CSS-first Tailwind v4 entry: source-limited theme/utilities imports, migrated palette/breakpoints/typography tokens, no preflight compatibility block, and removed tailwind.config.cjs/postcss.config.cjs. Corrected a first pass of missed v4 class candidates and selector escaping. `npm run build` and `npm run typecheck` pass; build reports pre-existing :deep() minifier warnings. Remaining work is the complete frontend/e2e selector grep gate and the required lint/fmt/unit/e2e verification before this task can be finalized.

2026-09-08 resumed final verification: all 1036 unit tests and frontend lint/fmt/typecheck/build pass; no v3 candidate syntax found in frontend/src or e2e specs, and source-limited CSS-first theme/breakpoints remain intact. Production cascade and importance audit exposed two TASK-0172 defects, now corrected and covered by rendered checks (11 passes, one mobile-hover skip). Current measurements and correction evidence are recorded in TASK-0172. Firefox desktop rerun is underway; touch tooltip scrolling also fails on pre-migration a1420a77, so completion still awaits resolution of that existing interaction blocker.

Final current-state Firefox desktop verification: 28 passed, 2 intentional skips (4.8m), log /tmp/timeful-171-firefox-desktop.log. All authorized styling fixes and their checks are complete; task remains In Progress because Firefox touch still has the pre-existing tooltip scrolling failure. The user scope question (include its fix in 0173 versus a separate task) remains unanswered. No commit created.

2026-09-08 user decision: keep the existing Firefox touch tooltip failure in a separate follow-up. TASK-0134 already covers the exact bug and now contains the current diagnosis, baseline comparison, artifacts and regression criteria. This supersedes the pending scope-approval question; tooltip implementation is not part of these migration changes. The failed touch acceptance evidence remains recorded; no failing check is marked as passing.

Finalization verification on HEAD dfefc63e (2026-09-08): frontend lint 0 errors (2 pre-existing vue/one-component-per-file warnings), fmt:check, typecheck and build pass; 1038 unit tests pass (140 files). Grep gates re-run clean: zero v3-syntax tw- candidates in frontend/src and e2e, zero !important in frontend/src, no important: param in vite.config.ts or index.css. Config state verified: tailwindcss ^4.3.3 + @tailwindcss/vite in package.json, tailwindcss() plugin registered in vite.config.ts, tailwind.config.cjs and postcss.config.cjs absent. index.css verified CSS-first: source(none) prefix(tw) theme/utilities imports into tailwind layers, @source globs limited to index.html/public HTML/src, @theme with --color-*: initial. Dist inspection: all canonical layers emitted in order (tailwind-reset absent by design, no preflight), --tw-color-* theme vars present, exactly 31 !important declarations all third-party (30 Vuetify main stylesheet helpers + forced-colors VHighlight), zero app-generated. Firefox desktop e2e from e2e/ on current HEAD: 28 passed, 2 intentional skips (4.8m). DoD #4: no hand-written Markdown files were changed by this task (code-only commits b0c15bd7..dfefc63e; backlog files are MCP-managed), so the format:markdown item is vacuously satisfied. The Firefox touch tooltip interaction remains tracked in TASK-0134 per user decision; tooltip fix dfefc63e landed separately and is not part of this task's scope.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: opencode
created: 2026-09-07 16:53
---
Supersede note: the utilities-carry-!important parity decision in AC #2/#6 (and the CSS-first `important` param in plan steps 2-3) is superseded by TASK-0172, which removes !important from frontend styling entirely: important: true is dropped from tailwind.config.cjs and hand-written overrides keep winning via unlayered-vs-layered cascade over tw: utilities and strictly higher specificity (or Vuetify props/slots) over runtime-injected Vuetify styles. The tailwind.config.cjs deletion and CSS-first @theme rewrite remain owned here.
---

author: Codex
created: 2026-09-07 19:45
---
Execution resumed on the existing Tailwind v4 migration baseline. I will complete TASK-0171 first, then TASK-0173, then TASK-0172 as their declared dependency sequence requires.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Migrated frontend styling from Tailwind CSS v3.4 to v4.3.3 while preserving the tw: prefix and rendered appearance. package.json now declares tailwindcss ^4.3.3 with the @tailwindcss/vite plugin registered in vite.config.ts; tailwind.config.cjs, postcss.config.cjs and the autoprefixer/postcss devDeps are removed. Styling is fully CSS-first in index.css: theme/utilities imports with source(none) prefix(tw), explicit @source globs limited to index.html, public/**/*.html and src, and a CSS-first @theme (--color-*: initial reset, full v3 palette incl. transparent/current and --timeful-* canonical color vars, explicit screens, --text-xs 0.813rem/1rem, Chivo Mono stack). All ~4k tw- candidates across frontend/src, unit-test assertions, escaped override selectors in index.css, and ~10 e2e specs were rewritten to v4 prefix-first syntax with trailing important modifiers and v4 utility renames; grep gates confirm zero remaining v3-syntax candidates in frontend/src and e2e. Behavior deltas were handled explicitly: v4 native hover semantics accepted (no sticky hover on pure touch devices), the 6 space-x/space-y call sites audited against the child-selector change, ring-2/ring-offset-2 verified to generate in 4.3.3. Note: the originally specified utilities-carry-!important parity (AC #2/#6) was superseded by TASK-0172's authorized cascade-layer integration, which removes !important entirely; the final built CSS ships tw: utilities without importance inside tailwind layers ordered above Vuetify layers, with no preflight and only third-party (Vuetify/VHighlight) importance remaining. Verification on HEAD dfefc63e: lint (0 errors, 2 pre-existing warnings), fmt:check, typecheck, build, and 1038 unit tests pass; dist inspection shows all canonical layers emitted (tailwind-theme, vuetify-core/components/overrides/utilities/final, tailwind-utilities) with no preflight and --tw-color-* theme vars; Firefox desktop e2e from e2e/: 28 passed, 2 intentional skips (4.8m). The pre-existing Firefox touch tooltip interaction is out of scope and tracked in TASK-0134.
<!-- SECTION:FINAL_SUMMARY:END -->
