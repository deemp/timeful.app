# E2E Authoring and Debugging

Rules for the self-contained browser E2E package at the repository root `e2e/`.
Run its npm commands from the package directory.
Specs live in `e2e/specs/`; `playwright.config.ts`, `isolated-test-stack.ts`, `config/`, `helpers/`, `repro/`, and `inspect/` stay at the package root.

## Failure Diagnosis Loop

- Run a failing test in isolation before changing anything: `npm run test:e2e -- --project=chromium-desktop -g "<test title>"`.
- Read the full error output first; Playwright prints the action call log with the waiting locator, the resolved element, and the retry attempts.
- Each run writes artifacts to its own `/tmp/opencode/timeful-e2e-artifacts/<run-id>/` directory; run directories are never cleaned automatically, so every run stays independently inspectable.
- Find the latest run with `ls -t /tmp/opencode/timeful-e2e-artifacts | head -1`, set `E2E_ARTIFACTS_DIR` to relocate the artifacts root, and remove old run directories manually when no longer needed.
- Open the failure trace with `npx playwright show-trace <run-dir>/<spec-name>-<test-title>/trace.zip`; config retains traces for every failed test, including local runs with zero retries.
- Failed tests also save a page-snapshot error context (`error-context.md`), a failure screenshot, and a video in the same result directory; use them when the trace alone does not explain the failure.
- `error-context.md` is written for every failed test that finishes normally, including hook failures and failures after the page closed; only a worker crash or an interrupted run can omit it.
- Diagnose why the element was missing, hidden, ambiguous, or non-actionable; do not fix a timeout by adding a fixed sleep or by raising timeouts blindly.
- Re-run the isolated test after each fix; widen back to the full project only once it passes.
- Use `npm run test:e2e -- --ui` for interactive step-by-step debugging and `DEBUG=pw:api` for protocol-level verbose logging.

## Authoring Rules

- Use user-facing locators: `getByRole`, `getByLabel`, `getByText`, and `getByTestId`; add a `data-testid` in app code when no accessible role exists.
- ESLint forbids `page.$`, `page.$$`, `page.pause`, `page.waitForSelector`, and raw `page.waitForTimeout` in this package.
- Assert with web-first expectations such as `expect(locator).toBeVisible()`, `toHaveCount()`, and `toContainText()`; they auto-retry, so never hand-roll polling.
- Use `expect(locator).toHaveCount()` when ambiguity is possible; strict mode fails loudly on multiple matches instead of acting on the wrong element.
- Pass an explicit timeout only with a reason; the default action timeout is 15 seconds and the default expect timeout is 5 seconds.
- Keep one behavior per test, and wrap long journeys in `test.step()` so traces and errors name the failing step.
- Seed state through the API instead of long UI setup journeys; reuse `./helpers` builders such as `seedCanonicalTimedEvent`.
- Treat fixed settle delays as exceptions; use `settlePage` from `./helpers/settle` only when no state-based wait can express the condition, for example settling a CSS transition after resize.

## Environment

- Run `npm ci` in this package and in `../frontend` before the first run; the Playwright webServer starts the frontend Vite dev server from `../frontend`, so frontend dependencies must be installed too.
- `npm run test:e2e` owns the isolated test stack (`mongo-test`, `postgres-test`, `server-test` on 3003) and Vite on 4174; never target the development API on 3002.
- See `../frontend/AGENTS.md` for required frontend checks and `./inspect/AGENTS.md` for `npm run inspect` diagnostics.
