# Frontend

The frontend migration is primarily from:

- `Date` / number / string
- JavaScript
- Vue 2

To:

- TypeScript
- Vue 3
- Composition API
- `Temporal` via `temporal-polyfill` (ponyfill entrypoint, which delegates to native engine `Temporal` where available)
- Vuetify

## ADR Rules

Read the ADRs that are relevant to the task before editing frontend code.

Always read:

- `../docs/design/architecture/adr/ADR-001.md` for boundary, transport, decoding, encoding, or model-shape changes

Read as applicable:

- `../docs/design/architecture/adr/ADR-002.md` for timezone decoding, fixed offsets, or timezone fallback changes
- `../docs/design/architecture/adr/ADR-004.md` for `Temporal`, native `Date`, encoded-time representation, or Temporal equality changes
- `../docs/design/architecture/adr/ADR-005.md` for civil-date or end-of-day changes
- `../docs/design/architecture/adr/ADR-006.md` for `Temporal` set or map membership and lookup changes

Do not treat "read every ADR in the folder" as the default requirement.

## Glossary Rules

Read `../docs/terminology/glossary.md` and follow `../docs/terminology/README.md` before working with timed-event slot terminology (enabled slots, active slots, picked dates, event/display timezone, slot-generation settings, advanced slot editing, and timed-grid cell terminology).
Glossary entries briefly define terms and identify their authoritative functional requirements; treat the glossary and the linked functional requirements as the source of truth when a definition matters.

## Architecture Rules

- keep boundary and transport types separate from internal frontend types
- preserve one canonical internal shape per concept
- keep transport decoding and encoding at explicit boundaries, not inside views, composables, or submit paths
- prefer typed domain helpers and composables over view-level coercion
- do not mix boundary payload shapes into component state
- keep shared timezone decoding centralized instead of rebuilding it ad hoc at call sites
- treat `Temporal` values with value semantics, not identity semantics
- keep civil-date and end-of-day semantics explicit at domain boundaries
- construct working-hours and overlap values from normalized Temporal values and
  the selected schedule timezone or fixed offset instead of reparsed strings
- make weekly helper call sites explicit about seed-week or rendered-week
  semantics

## Styling Rules

- use layout-based fixes instead of overrides or hacks
- when debugging Vuetify wrapper behavior, verify rendered ancestor styles such as wrapper opacity, not only the leaf node
- in non-scoped Vue style blocks, prefer plain selectors over `:deep(...)` for framework wrapper overrides
- use `:deep(...)` only when scoped styles actually need to cross component boundaries
- confirm the final selector matches the rendered class structure in the browser
- use existing `--timeful-*` semantic tokens for shared visual states instead of
  adding component-local raw palette values
- prefer owned markup, slots, or shared classes over framework-internal
  overrides for shared visual-state styling

## Vuetify Migration Rules

- use explicit Vuetify 3 props for selected visual behavior instead of legacy
  shorthand props
- use `variant="text"`, `variant="plain"`, or `variant="outlined"` instead of
  legacy boolean button props
- use explicit size values such as `size="small"` instead of legacy boolean
  size props
- express contrast and floating icon-action styling with explicit classes and
  current-version button props rather than `dark` or `fab`

## Browser Verification

- the browser E2E suite is a self-contained package at `../e2e`, not part of the frontend package
- keep repo-tracked Playwright specs and helpers under `../e2e`
- use Playwright specs for assertion-based regression coverage
- run browser E2E through `npm run test:e2e` from `../e2e`; it owns the isolated test API on `3003` and Vite on `4174`, never the development API on `3002`
- use `npm run inspect -- --target <scenario-name>` from `../e2e` for current-app diagnostics
- follow `../e2e/AGENTS.md` for e2e authoring and failure-diagnosis rules
- follow `../e2e/inspect/AGENTS.md` for inspection command details

## Required Checks

After meaningful frontend changes, run:

- `npm run lint`
- `npm run fmt:check`
- `npm run typecheck`
- `npm run build`
- `npm run test:unit`

Add regression coverage when fixing a reproduced migration bug unless there is a concrete reason it cannot be covered at that layer.
