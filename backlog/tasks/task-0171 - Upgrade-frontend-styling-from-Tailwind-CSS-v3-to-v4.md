---
id: TASK-0171
title: >-
  Upgrade frontend styling from Tailwind CSS v3 to v4 (keep tw prefix,
  appearance parity)
status: In Progress
assignee:
  - opencode
created_date: '2026-09-07 14:26'
updated_date: '2026-09-07 16:06'
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
- [ ] #1 frontend/package.json declares tailwindcss ^4.3.3 + @tailwindcss/vite, vite.config.ts registers the plugin, and postcss.config.cjs, tailwind.config.cjs and the autoprefixer/postcss devDeps are removed; vite build and dev server work with v4
- [ ] #2 Built CSS preserves v3 global behavior: utilities carry !important, preflight is absent, only tw:-prefixed classes generate (no unprefixed utilities), and explicit @source globs scan only index.html, public/**/*.html and src (source(none) prevents repo-root scanning of docs/backlog)
- [ ] #3 Theme is fully CSS-first in index.css @theme with no JS config: --color-*: initial reset, full v3 palette (transparent/current kept, red -> var(--timeful-red-canonical), outline-neutral -> var(--timeful-outline-neutral), unused avail-green dropped), explicit screens (sm/md/mdlg/lg/xl/2xl/publift-s/m/l/xl), --text-xs 0.813rem/1rem, --font-mono Chivo Mono stack
- [ ] #4 All candidates use v4 syntax: prefix-first (tw:flex, tw:hover:bg-green, tw:md:hidden, variant order preserved), trailing important (tw:opacity-0!), renamed utilities mapped (tw:rounded-sm, tw:rounded-xs, tw:shadow-xs, tw:drop-shadow-sm), index.css override selectors use escaped colons (.tw\:bg-white), and the NewEvent.test.ts red-token assertion reads @theme in index.css; grep gates find zero remaining v3-syntax candidates in frontend/src and e2e
- [ ] #5 Behavior deltas handled explicitly: v4 native hover recorded as accepted (no sticky hover on touch devices), the 6 space-x/space-y call sites audited against the v4 child-selector change, ring-2/ring-offset-2 verified to generate in v4.3.3, no other renamed/removed utility remains
- [ ] #6 Appearance parity verified: dist CSS inspection (utilities with !important, no preflight, --tw-color-* theme vars), unlayered index.css overrides still win over layered utilities, visual smoke check via local dev flow plus firefox e2e suite passes
- [ ] #7 All required frontend checks pass: lint, fmt:check, typecheck, build, test:unit
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
1. Session bootstrap: read this task fully; implementation happens in a fresh session. Work continues on branch chore/tailwind-v4, which carries the uncommitted `npx @tailwindcss/upgrade` output (2026-09-07, mostly staged): ~135 modified files under frontend/. Keep task status In Progress. Do not commit unless the user asks.

2. Micro-probes (only in /tmp/opencode, no repo changes; recreate the probe with tailwindcss `compile` + manual candidate arrays if /tmp did not persist):
   - Layered no-preflight imports with params: `@layer theme, base, components, utilities;` plus `@import 'tailwindcss/theme.css' layer(theme) source(none) prefix(tw) important;` and `@import 'tailwindcss/utilities.css' layer(utilities) source(none) prefix(tw) important;` — confirm params are accepted on sub-imports, utilities carry !important, no preflight appears, and an @theme block in the app file applies with the prefix.
   - @source brace-glob support for `./**/*.{vue,js,ts,jsx,tsx}`; if unsupported, emit one @source directive per extension.
   - Belt-and-braces: bare `tw:bg-green`, `tw:ring-2`, `tw:ring-offset-2`, `tw:last:mb-0` all generate.
   - New: check whether bare legacy names `tw:rounded` / `tw:shadow` still generate in v4.3.3 and at which scale, to know what the not-yet-renamed bare uses currently render as.

3. index.css rewrite (starts from the tool's file):
   - Remove `@config '../tailwind.config.cjs';` and the tool-added `@layer base` border-color compat block (v3 had no preflight, so that base rule is a parity violation).
   - Replace the bare import with the layered no-preflight imports from step 2 plus @source globs mirroring the v3 content array: `@source '../index.html';`, `@source '../public/**/*.html';`, and the src vue/js/ts globs relative to src/index.css.
   - Add the @theme block: `--color-*: initial;` then transparent/current plus the full v3 palette, with `--color-red: var(--timeful-red-canonical)` and `--color-outline-neutral: var(--timeful-outline-neutral)`; screens: define all explicitly including `--breakpoint-mdlg: 896px` and `--breakpoint-publift-s/m/l/xl: 755px/995px/1225px/1475px` (v4 defaults match the v3 sm/md/lg/xl/2xl values); `--text-xs: 0.813rem; --text-xs--line-height: 1rem;`; `--font-mono: 'Chivo Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace`.
   - Keep :root tokens and all unlayered override classes unchanged; rewrite the 6 dash-form tailwind-class selectors the tool left (index.css lines ~105-133) to escaped-colon form: `.timeful-elevated-button.tw\:bg-white`, `.tw\:bg-green`, `.tw\:bg-white.tw\:text-green`, `.tw\:bg-very-dark-gray`, `.tw\:bg-blue`, `.tw\:bg-white.tw\:text-blue`.

4. Build config swap to the AC-1 route (the tool installed the PostCSS route instead): add `@tailwindcss/vite` and register the plugin in vite.config.ts; delete frontend/postcss.config.cjs and frontend/tailwind.config.cjs; remove `@tailwindcss/postcss` and `postcss` from devDependencies (autoprefixer is already gone).

5. Finish what the tool missed (candidates are already prefix-first; do not re-run a blanket codemod):
   a. v4 renames (tool did none; recount from the worktree, the original probe numbers are stale): `tw:rounded-sm` -> `tw:rounded-xs`; bare `tw:rounded` -> `tw:rounded-sm` (~19 uses in vue plus ts files); `tw:shadow-sm` -> `tw:shadow-xs` (1 use); bare `tw:drop-shadow` -> `tw:drop-shadow-sm` (3 uses in vue); safety rules if present: bare `tw:ring` -> `tw:ring-3`, `tw:outline-none` -> `tw:outline-hidden`.
   b. Test dot-selectors: in *.test.ts, rewrite every remaining dash-form `.tw-…` selector and escape every dot-leading v4 selector to `.tw\\:` in source (e.g. `find("div.tw\\:fixed")`); the tool wrote invalid unescaped selectors like `find(".tw:items-center")` and left mixed dash-form ones like `.tw-flex.tw-flex-col.tw:gap-5`. Known files: RespondentsList.test.ts (13), ScheduleOverlap.mobileTooltip.test.ts (7), SignUpBlocksList.test.ts (4), ScheduleOverlapSidebar.test.ts (2), App.test.ts, ColorLegend.test.ts, NewEvent.test.ts. Class-string `toContain("tw:...")` assertions stay unescaped.
   c. Audit the ~29 remaining dash-form hits across ~20 vue files (CalendarAccount.vue 5, SignInDialog.vue 3, Settings.vue 3, and one-off hits elsewhere): fix real missed candidates, leave genuine non-candidates (prose, URLs, comments) untouched.
   d. e2e specs and helpers (untouched by the tool): rewrite the 33 dash-form occurrences across the 10 files under e2e/specs plus e2e/helpers/timed-event-helpers.ts to v4 syntax with the same rename and reorder rules.
   e. NewEvent.test.ts: rewrite the red-token assertion to read the @theme `--color-red: var(--timeful-red-canonical)` line in index.css and drop the tailwind.config.cjs read (line ~919 still references it).
   f. Review the full git diff for tool-introduced issues: prose/comment/URL false positives, value conversions like `tw-border-[1px]` -> `tw:border` (verify equivalence), and any reordered or dropped classes.

6. Verification:
   - Grep gates (PCRE2): no remaining dash-form candidates matching `(?<![\w:\\-])tw-[\w-]` in frontend/src (excluding genuine non-candidates found in 5c) or e2e; no `hover:tw-`-style variants; no `tw-` inside vue style blocks; no `@config` remaining in index.css.
   - Required checks from frontend/: lint, fmt:check, typecheck, build, test:unit.
   - Inspect dist CSS: utilities emitted with !important, zero preflight rules, `--tw-color-*` theme vars present, unlayered overrides independent of layers.
   - Space-x/y audit in the 6 files (groups/InvitationDialog.vue, settings/CalendarAccount.vue, Footer.vue, groups/NewGroup.vue, views/Home.vue, views/Test.vue) for the v4 child-selector change.
   - Visual smoke: local dev flow (sign in, /home, create event) including a mobile-viewport spot check noting the accepted hover delta; then firefox e2e from e2e/ per its AGENTS.md.

7. Wrap-up: run `graphify update .`; record probe and dist evidence as task comments; verify each AC with objective evidence; check DoD; write the final summary; mark Done. Do not commit unless the user asks.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-09-07: User ran `npx @tailwindcss/upgrade` on chore/tailwind-v4. Audit of the tool output (worktree, uncommitted, mostly staged): package.json now has tailwindcss ^4.3.3 + @tailwindcss/postcss with autoprefixer removed (tool chose the PostCSS route; vite.config.ts untouched, tailwind.config.cjs kept via `@config`); index.css is a bare `@import 'tailwindcss' prefix(tw);` + `@config '../tailwind.config.cjs';` + a tool-added `@layer base` border-color compat block; all ~135 src files' class strings and class-string test assertions were rewritten to prefix-first v4 syntax and `!tw-opacity-0` became trailing-`!`. NOT done by the tool: v4 renames (zero -xs utilities; bare tw:rounded ~19 uses in vue, tw:rounded-sm 1, tw:shadow-sm 1, tw:drop-shadow 3), dot-selector escaping in tests (find(".tw:fixed") unescaped-invalid, some find() selectors still dash-form: RespondentsList.test.ts 13, ScheduleOverlap.mobileTooltip.test.ts 7, SignUpBlocksList.test.ts 4, ScheduleOverlapSidebar.test.ts 2, App/ColorLegend/NewEvent 1 each), ~29 remaining dash-form hits across ~20 vue files needing an audit, 6 dash-form override selectors in index.css, e2e specs untouched (33 dash-form occurrences in 10 files), NewEvent.test.ts still reads tailwind.config.cjs. Plan rewritten accordingly; task decision bullet updated from 'official tool is not used' to 'tool ran, output is the baseline'.
<!-- SECTION:NOTES:END -->
