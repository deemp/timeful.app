---
id: TASK-0183
title: Fix silently skipped Go cache copy-out and delete empty CI cache zombies
status: Done
assignee: []
created_date: '2026-09-08 13:43'
updated_date: '2026-09-08 13:50'
labels:
  - ci
dependencies: []
modified_files:
  - .github/workflows/backend-ci.yml
  - .github/workflows/e2e-ci.yml
priority: medium
type: chore
ordinal: 188000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The monolithic actions/cache@55cc8345 (v6.1.0) step stores cache-primary-key/cache-matched-key as runner state only and never emits them as step outputs (only cache-hit), so the "Save Go caches" copy-out gate rendered `if [ "" != "" ]` on every run and silently never copied the warmed external volumes back out. On the first post-merge main run (2026-09-04, run 33874156847, a complete cache miss because PR #17's healthy cache was merge-ref-scoped), the post-save steps then uploaded empty 194 B / 197 B tarballs under the exact go.sum keys on refs/heads/main. Every run since — main and all PRs, which inherit base-branch caches — exact-hits those empty entries; exact-hit saves never happen, so the zombies can never self-heal. Evidence: backend-quality run logs render `if [ "" != "" ]` in Save Go caches; `gh cache list` shows both 194/197-byte entries on refs/heads/main created 2026-09-04T12:46:34Z.

Fix using the split actions pattern (Option B): use actions/cache/restore (which emits cache-primary-key/cache-matched-key outputs) for the Go build and Go module caches in backend-ci.yml and e2e-ci.yml, copy warmed volumes back out only when the restore did not exact-hit the primary key and the volume is non-empty, then upload via explicit actions/cache/save steps gated on the copy-out result. This also hardens against re-poisoning: an aborted run must not save an empty entry. Then delete the two empty zombie cache entries from timeful-foss/timeful so the next run saves fresh caches; do not version or rename cache keys.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 backend-ci.yml and e2e-ci.yml use actions/cache/restore for the Go build and Go module caches plus explicit actions/cache/save steps, with the copy-out and save gated on the cache-primary-key/cache-matched-key outputs that the restore action actually emits, so every run that did not exact-hit the primary key copies the warmed volumes out and saves them
- [x] #2 The copy-out refuses to copy from an empty external cache volume and the save steps are gated on the copy-out result, so an aborted or failed-early run can never write an empty cache entry over a key
- [x] #3 Exact primary-key hits skip both the copy-out and the save steps, preserving the original skip-on-exact-hit intent
- [x] #4 The two empty zombie caches go-mod-linux-58b7c2674e85e49bab24139778f380d17ddd876c20cfdf31e816b1771a4353e0 (194 B) and go-build-linux-58b7c2674e85e49bab24139778f380d17ddd876c20cfdf31e816b1771a4353e0 (197 B) scoped to refs/heads/main are deleted from the repository; cache keys are not versioned or renamed
- [x] #5 actionlint passes on all workflow files
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 All acceptance criteria are satisfied
- [ ] #2 All required unit tests pass. Documentation-only changes are exempt unless the user requests unit tests
- [ ] #3 All required e2e tests pass. Documentation-only changes are exempt unless the user requests e2e tests
- [x] #4 Changed Markdown files are formatted with npm run format:markdown
<!-- DOD:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Diagnosis (verified this session): the pinned monolithic actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9 (v6.1.0) never emits cache-primary-key/cache-matched-key outputs - src/restoreImpl.ts stores them via StateProvider.setState (core.saveState only) and action.yml declares only the cache-hit output; the outputs variant exists only in actions/cache/restore (NullStateProvider). Empty zombie entries: refs/heads/main go-mod-linux-58b7c267... (194 B) and go-build-linux-58b7c267... (197 B), created 2026-09-04T12:46:34Z by main run 33874156847.

Implementation plan: (1) In both workflows, switch the two Go cache steps from actions/cache to actions/cache/restore (same pinned SHA, restore/ subaction path). (2) Replace the Save Go caches shell gate with a copy-out step (if: always()) that copies each warmed volume out only when primary-key != matched-key AND the volume is non-empty, emitting GITHUB_OUTPUT flags build/mod. (3) Add explicit actions/cache/save steps for both caches, gated on `always() && <copyout flag> == 'true'`, saving with the restore step's cache-primary-key output. (4) Validate with actionlint. (5) Delete the two zombie cache entries by ID from timeful-foss/timeful (user decision: no key versioning, just delete and let fresh caches accrue). Migrator-image and npm caches stay monolithic: they need no copy-out and their post-save works.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Root cause: the pinned monolithic actions/cache@55cc8345 (v6.1.0) stores cache-primary-key/cache-matched-key as runner state only and never emits them as step outputs (action.yml declares only cache-hit; outputs exist solely in actions/cache/restore), so the "Save Go caches" gate rendered `if [ "" != "" ]` on every run and never copied warmed volumes back out. The first post-merge main run (2026-09-04, run 33874156847, complete cache miss because PR #17's healthy cache was merge-ref-scoped) then post-saved empty 194 B (go-mod) and 197 B (go-build) tarballs under the exact go.sum keys on refs/heads/main; every later run exact-hit those zombies and exact-hit saves never happen, so main and all PRs ran fully cold.

Changes (both .github/workflows/backend-ci.yml and .github/workflows/e2e-ci.yml):
- Go build and module caches switched from monolithic actions/cache to actions/cache/restore (same pinned SHA 55cc8345, v6.1.0), which emits the cache-primary-key/cache-matched-key outputs (verified against restore/action.yml at the pinned SHA).
- "Save Go caches" replaced by "Copy warmed Go caches out of the external volumes" (if: always(), id go-cache-copyout): copies each volume out only when primary-key != matched-key AND the volume is non-empty (docker run alpine ls -A guard), emitting build/mod GITHUB_OUTPUT flags. Exact hits skip the copy-out; aborted/failed-early runs can no longer write an empty entry over a key.
- Explicit "Save Go build cache" / "Save Go module cache" steps with actions/cache/save (same SHA) gated on `always() && steps.go-cache-copyout.outputs.<flag> == 'true'`, saving with the restore step's cache-primary-key. Cross-workflow same-key save races are benign: saveImpl logs reserve failures as warnings and exits success.
- Migrator-image and npm caches left monolithic (no copy-out needed; their post-save works).
- Cache keys unchanged (no versioning, per user decision).

Cache cleanup: deleted the two zombie entries from timeful-foss/timeful by ID (go-mod-linux-58b7c267... 194 B id 7328568175, go-build-linux-58b7c267... 197 B id 7328568754, both refs/heads/main). Verified via gh cache list: no go-mod-linux-58b7/go-build-linux-58b7 entries remain on main; healthy PR #17-scoped entries (258 MB go-mod, 97 MB go-build) untouched.

Validation: actionlint 1.7.12 passes on all workflows; npm run format:markdown:check passes. Unit/e2e suites not applicable (CI workflow config change; no test harness covers workflow YAML). Expected CI behavior after merge: first run per ref misses and saves real caches via the new save steps; subsequent runs exact-hit with real sizes (~258 MB module, ~100 MB build).
<!-- SECTION:FINAL_SUMMARY:END -->
