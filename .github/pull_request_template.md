<!-- PR title: use conventional commit style, e.g. "feat(frontend): ..." or "fix(server): ...". -->

## Summary

<!-- What changed and why? State the motivation or root cause, not just the diff, and link the motivating issue. -->

## Changes

<!-- Key changes as concise bullets, grouped per Backlog task or per area. For multi-task PRs, use one subsection per group. -->

## Non-goals

<!-- What is deliberately deferred or out of scope? Name the follow-up tasks. Remove this section if empty. -->

## Backlog tasks

<!-- Reference the tracked tasks, e.g. TASK-0165, TASK-0182. Remove this section if none. -->

## Validation

<!-- Paste the exact commands you ran, including required env vars and e2e projects, then check them. Remove the lines that do not apply. -->

- [ ] Frontend: `npm run lint`, `npm run fmt:check`, `npm run typecheck`, `npm run build`, `npm run test:unit` (from `frontend/`)
- [ ] E2E: `npm run test:e2e` (projects: chromium-desktop, chromium-mobile, firefox-desktop) (from `e2e/`)
- [ ] Backend: route tests via the `compose.test.yaml` isolated overlay
- [ ] Workflows changed: `actionlint`
- [ ] Markdown changed: `npm run format:markdown:check`, `npm run lint:markdown`

## Risk and impact

<!-- Breaking changes, env var contract changes (`docs/environments.md`), DB migrations (backfill behavior, downgrade policy, rollout notes in `docs/postgres-staging-rollout.md`), browser-plugin `window.postMessage` payload changes (`PLUGIN_API_README.md`), stale docs to update, and follow-ups. Remove this section if empty. -->

## Reviewer notes

<!-- Point reviewers at the riskiest files or decisions and anything you want challenged. Remove this section if empty. -->
