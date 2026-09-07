# Frontend Inspection Tools

These TypeScript CLIs inspect the current frontend with Playwright.
They produce diagnostic snapshots and route profiles; assertion-based regression coverage belongs in sibling `e2e/*.spec.ts` files.

## Commands

Run from `e2e/`:

- `npm run inspect -- --target <scenario-name>`
- `npm run inspect:landing`
- `npm run inspect:route`
- `npm run inspect:collector-bisect`

The default frontend URL is `http://127.0.0.1:4173`.
Override it with `FRONTEND_URL`.
Event scenarios accept `COMPARATOR_EVENT_PATH` and `COMPARATOR_EVENT_WAIT_UNTIL` until their next configuration cleanup.

## Verification

- Start the backend before inspecting event routes.
- Run inspection commands sequentially in Firefox.
- Use `e2e/*.spec.ts` specs for behavior assertions and regression coverage.
