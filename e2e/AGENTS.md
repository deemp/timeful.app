# E2E Authoring and Debugging

Rules for the self-contained browser E2E package at the repository root `e2e/`.
Run its npm commands from the package directory.
Specs live in `e2e/specs/`; `playwright.config.ts`, `isolated-test-stack.ts`, `config/`, `helpers/`, and `inspect/` stay at the package root.

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
- Use `E2E_VIDEO=on npm run test:e2e -- --trace=on <selection>` to retain videos and traces for successful slow tests as well as failures.
  By default, both are retained only on failure.
- Multi-session specs should import `test` from `helpers/actor-context.ts` and use `actorContext("target")` to create isolated contexts with video lifecycle management.
  Direct `browser.newContext()` calls appear in traces but do not automatically record videos through Playwright Test's `video` option.
  The fixture attaches videos named by actor and page, including pages closed before the test ends, and deletes recordings for successful tests under the default retention policy.
  In the access-transfer spec, `video.webm` is the source page, `video-2-target-1.webm` is the target, and `video-3-stranger-1.webm` is the other browser; the API-only context creates no video.

## Authoring Rules

- Use user-facing locators: `getByRole`, `getByLabel`, `getByText`, and `getByTestId`; add a `data-testid` in app code when no accessible role exists.
- ESLint forbids `page.$`, `page.$$`, `page.pause`, `page.waitForSelector`, and raw `page.waitForTimeout` in this package.
- Assert with web-first expectations such as `expect(locator).toBeVisible()`, `toHaveCount()`, and `toContainText()`; they auto-retry, so never hand-roll polling.
- Use `expect(locator).toHaveCount()` when ambiguity is possible; strict mode fails loudly on multiple matches instead of acting on the wrong element.
- Pass an explicit timeout only with a reason; the default action timeout is 15 seconds and the default expect timeout is 5 seconds.
- Keep one behavior per test, and wrap long journeys in `test.step()` so traces and errors name the failing step.
- Seed state through the API instead of long UI setup journeys; reuse `./helpers` builders such as `seedCanonicalTimedEvent`.
- For API-seeded browser owner journeys, pass `page.request` or `page.context().request` to the seed helper before opening the event.
  These request contexts share the browser's cookie jar, including the HttpOnly creation cookies that prove [Event Owner](../docs/terminology/glossary.md#event-owner) authority in PostgreSQL mode.
  The standalone Playwright `request` fixture has its own cookie jar, so an event created through it leaves the page without creation credentials.
  Keep separate request or browser contexts for visitor and authorization-denial journeys; do not substitute visitor credentials for owner authority or bypass the edit control.
- Treat fixed settle delays as exceptions; use `settlePage` from `./helpers/settle` only when no state-based wait can express the condition, for example settling a CSS transition after resize.

## Environment

- Run `npm ci` in this package and in `../frontend` before the first run; the Playwright webServer starts the frontend Vite dev server from `../frontend`, so frontend dependencies must be installed too.
- `npm run test:e2e` owns the isolated test stack (`mongo-test`, `postgres-test`, `server-test` on 3003) and Vite on 4174; never target the development API on 3002.
- See `../frontend/AGENTS.md` for required frontend checks and `./inspect/AGENTS.md` for `npm run inspect` diagnostics.

### Fast local runs

- Local runs default to two workers; CI defaults to one.
  Use `--workers=4` to try more concurrency or `--workers=1` for sequential diagnosis; Firefox has no additional project-level cap.
  Existing serial test groups still run their own tests in order.
- Run a focused spec with `npm run test:e2e -- --project=firefox-desktop specs/timed-event-reprojection-firefox.spec.ts`, or select a title with `-g "<test title>"`.
- Ordinary projects start Vite without a production build.
  Production-style checks live in `styling-production.spec.ts` and run in `chromium-production-desktop` and `chromium-production-mobile`, which share the `production-assets` build dependency.
- Run `npm run test:e2e -- --project=chromium-production-desktop --project=chromium-production-mobile` for production-asset verification.
  Do not use `--no-deps`: the dependency builds fresh assets before the checks.
- Run `npm run test:e2e` for all projects, including the production build and checks.
  To verify PostgreSQL creation as well, run `E2E_POSTGRES_ANONYMOUS_EVENT_CREATION_ENABLED=true npm run test:e2e -- --project=firefox-desktop`.
- Keep parallelism inside a single Playwright invocation; concurrent invocations conflict over the fixed test-stack project and ports.
  The stack prints setup and teardown durations so infrastructure overhead can be distinguished from test execution.
- The Firefox desktop plus touch benchmark passed at one and two workers, reducing wall time from 337s to 239s at two workers; four workers caused timeouts and was rejected.
- PostgreSQL access-transfer coverage is heavier: each approval test opens and records up to three isolated pages, and the default dev server's unbundled modules can push the approval journeys past their 30-second budget at two workers.
- Set `E2E_FRONTEND=bundled` to make the webServer build a fresh test-mode frontend and serve it from a Playwright-owned preview on the isolated host, port, and proxy, with assets under the invocation artifact directory.
  Bundled mode is opt-in and does not replace the production-asset projects; the dev server remains the default.
  On the benchmark machine, all eight access-transfer tests pass at the default two workers with `E2E_FRONTEND=bundled E2E_VIDEO=on`, and the first four pass repeatedly.
- Use `E2E_POSTGRES_ANONYMOUS_EVENT_CREATION_ENABLED=true npm run test:e2e -- --project=firefox-desktop --workers=1 specs/timed-event-access-transfer-firefox.spec.ts` as the sequential fallback when bundled mode is unavailable.
