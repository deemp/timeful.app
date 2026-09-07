---
id: TASK-0170
title: 'Add Sub-grid Gap controlled term, FR-120, and reverse CAND-005 exclusion'
status: Done
assignee:
  - opencode
created_date: '2026-09-07 12:09'
updated_date: '2026-09-07 12:12'
labels:
  - terminology
  - requirements
dependencies: []
references:
  - docs/terminology/glossary.md
  - docs/requirements/functional/fr/FR-120.md
  - docs/requirements/README.md
  - docs/requirements/functional/fr/FR-093.md
  - docs/requirements/migration/backlog-fr-inventory-candidates/CAND-005.md
  - docs/requirements/migration/backlog-fr-inventory-candidates/CAND-108.md
documentation:
  - docs/requirements/AGENTS.md
  - docs/requirements/README.md
  - docs/requirements/functional/README.md
  - docs/terminology/README.md
  - docs/requirements/migration/README.md
modified_files:
  - docs/terminology/glossary.md
  - docs/requirements/functional/fr/FR-120.md
  - docs/requirements/README.md
  - docs/requirements/functional/fr/FR-093.md
  - docs/requirements/migration/backlog-fr-inventory-candidates/CAND-005.md
  - docs/requirements/migration/backlog-fr-inventory-candidates/CAND-108.md
priority: medium
type: docs
ordinal: 179300
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add the controlled terminology term **Sub-grid Gap** and a functional requirement mandating it, reversing the earlier CAND-005 "implementation detail" exclusion after product review.

Confirmed product decisions (do not relitigate):
- Term name: **Sub-grid Gap** (user-selected from Sub-grid Gap, Sub-grid Spacer, Column Gap, Projected Column Spacer). It names the user-visible outcome: the Timed Grid splits into sub-grids and this is the gap between them.
- New standalone FR-120, not an FR-002 amendment: FR-002 covers projection semantics (which columns exist, which slots they contain); unrelated obligations belong in separate requirement files.
- Definition: the visible separation between adjacent Projected Date Columns whose Civil Dates are not consecutive in the Display Timezone; it splits the Timed Grid into sub-grids and contains no grid cells.
- Consecutiveness is judged on Civil Dates, not elapsed hours, so a daylight saving transition day stays consecutive and must not gain a gap.
- Viewport-agnostic (desktop and mobile pages alike).
- FR-093 presupposes the gap ("the gap between split sub-grids") and must adopt the canonical term.

Constraints:
- Docs-only change: no runtime code, no unit or e2e tests.
- Candidate Source quotes in CAND-005 and CAND-108 stay verbatim (no glossary links inside raw quotes); only authored prose adopts the term.
- Follow docs/requirements/AGENTS.md, docs/requirements/README.md, docs/terminology/README.md, and docs/requirements/migration/README.md conventions (sentence per line, first-use linking, one table row per line, candidate metadata and review fields updated together).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 docs/terminology/glossary.md defines the controlled term Sub-grid Gap in the Presentation section with a TOC entry, links on first use of controlled terms, and FR-120 as its authoritative context
- [x] #2 A new FR-120 file exists in docs/requirements/functional/fr with front matter id FR-120, type functional, components [frontend], status proposed, requiring a Sub-grid Gap between adjacent Projected Date Columns whose Civil Dates are not consecutive in the Display Timezone, and excluding consecutive-date columns including across a daylight saving transition
- [x] #3 docs/requirements/README.md indexes FR-120 in the functional requirements table with a stable relative link as one physical table row
- [x] #4 FR-093 refers to the canonical Sub-grid Gap term with a linked first occurrence instead of the phrase 'the gap between split sub-grids'
- [x] #5 CAND-005 metadata and review fields are updated together: verdict proposed-requirement, requirement_type FR, related_requirements [FR-120], classification candidate FR, disposition promoting FR-120 and recording the reversal of the earlier implementation-detail exclusion; the Source quote stays verbatim
- [x] #6 CAND-108 authored candidate-behavior prose links the Sub-grid Gap term; its Source quote stays verbatim
- [x] #7 npm run format:markdown and npm run lint:markdown pass for the changed Markdown files
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
Implementation plan (approved by user in planning session):

1. `docs/terminology/glossary.md`
   - TOC: add `- [Sub-grid Gap](#sub-grid-gap)` after the `[Projected Date Column]` line (line ~81).
   - New `### Sub-grid Gap` entry between `Projected Date Column` (ends line 602) and `Grid Pointer`:
     "The visible separation between adjacent [Projected Date Columns] whose [Civil Dates] are not consecutive in the [Display Timezone]. It splits a [Timed Grid] into sub-grids and contains no grid cells." + `Authoritative context: [FR-120](../requirements/functional/fr/FR-120.md).` — first use of each controlled term linked within each paragraph.
2. Create `docs/requirements/functional/fr/FR-120.md`
   - Front matter: `id: FR-120`, `title: Separate Non-consecutive Projected Date Columns With a Sub-grid Gap`, `type: functional`, `components: [frontend]`, `status: proposed`.
   - Para 1: On a Timed Grid, adjacent Projected Date Columns whose Civil Dates are not consecutive in the Display Timezone shall be separated by a Sub-grid Gap containing no grid cells (links per glossary rule).
   - Para 2 exclusion: adjacent columns for consecutive Civil Dates have no Sub-grid Gap, including across a daylight saving transition in the Display Timezone (23/25-hour days stay consecutive).
   - Relative glossary path from `functional/fr/`: `../../../terminology/glossary.md`.
3. `docs/requirements/README.md`: append FR-120 row after the FR-119 row; one physical line; links `functional/fr/FR-120.md`, `../terminology/glossary.md#projected-date-column`, `../terminology/glossary.md#sub-grid-gap`.
4. `docs/requirements/functional/fr/FR-093.md` line 16 → "Covered outside areas include the [Sub-grid Gap](../../../terminology/glossary.md#sub-grid-gap) and the collapsed-hours strip." (first occurrence in paragraph → link).
5. `docs/requirements/migration/backlog-fr-inventory-candidates/CAND-005.md` — reverse the exclusion, metadata and review fields together:
   - Front matter: `verdict: proposed-requirement`, add `requirement_type: FR`, `related_requirements: [FR-120]`, `confidence: confirmed`.
   - Candidate behavior: assert the gap behavior with linked terms (glossary path `../../../terminology/glossary.md`).
   - Classification: `candidate FR`.
   - Existing Requirements and Confidence: FR-002 defines columns and their contents, not spacing; FR-093 presupposes the gap without requiring it. Confidence: confirmed.
   - Disposition: promoted to `../../functional/fr/FR-120.md`, reversing the earlier implementation-detail exclusion after product review.
   - Open Questions: `None.`
   - Source quote stays verbatim.
6. `docs/requirements/migration/backlog-fr-inventory-candidates/CAND-108.md` — authored Candidate behavior line links Sub-grid Gap on first use; Source quote and all other sections unchanged.
7. Validation from repo root: `npm run format:markdown` (Prettier sentences-per-line pipeline) on changed files, then `npm run format:markdown:check` and `npm run lint:markdown`. Docs-only: no unit/e2e tests per DoD exemption.
8. Finalize per task-finalization guide: verify each AC with evidence, record final summary, set status Done (leave in Done; do not archive).

Risks: Prettier may reflow the new table row or prose lines; run the formatter after edits and re-check. Glossary anchor for the new heading is `#sub-grid-gap`.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Executed the approved plan as written; no deviations. The Markdown formatter re-aligned the new FR-120 index row, and format:markdown:check plus lint:markdown pass.

backlog/backlog.md carries pre-existing uncommitted edits from another session (including the 'FR - spacer between columns' inbox line that sourced CAND-005); left untouched per scope and rewrite-safety rules.

Doc changes appear staged in git (first-column M/A) alongside the dirty backlog.md; no commit was made, per the no-commit-without-request rule.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## What changed

Added the controlled terminology term **Sub-grid Gap** and proposed FR-120 mandating it, reversing the CAND-005 "implementation detail" exclusion after product review.

- `docs/terminology/glossary.md`: new `Sub-grid Gap` entry in the Presentation section (after Projected Date Column) with a TOC entry and FR-120 as authoritative context; the gap is the visible separation between adjacent Projected Date Columns whose Civil Dates are not consecutive in the Display Timezone, splitting the Timed Grid into sub-grids and containing no grid cells.
- `docs/requirements/functional/fr/FR-120.md` (new; proposed, frontend): requires the Sub-grid Gap between non-consecutive projected columns and excludes consecutive-date columns, including across a daylight saving transition (consecutiveness judged on Civil Dates, not elapsed hours).
- `docs/requirements/README.md`: FR-120 row appended to the functional requirements index.
- `docs/requirements/functional/fr/FR-093.md`: "the gap between split sub-grids" replaced with the canonical linked **Sub-grid Gap** term.
- `docs/requirements/migration/backlog-fr-inventory-candidates/CAND-005.md`: verdict excluded → proposed-requirement (FR), related_requirements [FR-120], classification candidate FR, disposition records the promotion and the reversal rationale; Source quote verbatim.
- `docs/requirements/migration/backlog-fr-inventory-candidates/CAND-108.md`: authored candidate-behavior prose links Sub-grid Gap; Source quote verbatim.

## Verification

- `npm run format:markdown` (normalized the new index row alignment), then `npm run format:markdown:check` and `npm run lint:markdown` both pass.
- Docs-only change: unit and e2e tests exempt per Definition of Done.

## Risks / follow-ups

- FR-120 is `proposed` and needs acceptance review.
- The originating inbox line "FR - spacer between columns" in `backlog/backlog.md` could be checked off, but that file carries pre-existing uncommitted edits from another session, so it was left untouched.
<!-- SECTION:FINAL_SUMMARY:END -->
